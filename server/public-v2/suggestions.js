import { parsePublicBookKey } from './contracts.js';
import { sanitizePublicCoverUrl } from './metadata.js';
import { parseRelatedSuggestions, parseSuggestionEvent } from './validation.js';
import { validateAndNormalize } from '../services/isbn.js';
import { blockedBook, collectionOrTextbook, createOpenLibrarySuggestionReads, parseWorkRecord, relatedQuery, titleKey } from '../services/openLibrarySuggestions.js';
import { peekOpenLibraryRead } from '../services/workDiscovery.js';

// Shelf suggestions (docs/plans/2026-11-14-desktop-and-shelf-
// suggestions.md, Part 2).
//
//   GET  /suggestions/related?book=<bookKey>
//                             -> { books: [{ bookKey, title, authors, coverUrl, workId? }], partial? }
//   POST /suggestions/events  { event: 'opened' | 'saved', bookKey } -> 202
//
// The related list is one public book's related books, the same for every
// reader: its first author's most-read other works, then the most-read works
// on its subject in its place, or on two of its specific subjects (never one
// subject alone). Covers only, Latin-letter titles, nothing for adults or
// naming extremism, no school anthology or textbook (more than three
// authors, or a title such as "… Literature, Gold Level"), one work per
// title. The address names only that book (an ISBN key or an Open Library
// work key) and the answer holds nothing about the reader, so Vercel's CDN
// and the browser keep it (RELATED_CACHE): a repeat lookup costs no function
// run. The app merges up to three such lists, adds
// its seed list, leaves out its saved books and picks five; it asks the
// chosen library's stored answers itself (POST /holdings/lookup).
//
// Never a catalog request and never the catalog store. At most OUTBOUND_CAP
// Open Library requests per answer (the book's record, the author's list,
// the subject-and-place list); each is also cached in this instance's memory
// for 24 hours. A slow or failing Open Library gives fewer books (possibly
// none) with 200 and `partial: true` by SUGGESTIONS_DEADLINE_MS; a partial
// answer is kept by the CDN for a minute only and never by the browser. An
// empty complete answer (an unknown book, or Open Library's 404 or empty
// list, which may be passing) is kept by the CDN for an hour and never by the
// browser.
//
// The anonymous log (USAGE_LOG_ENABLED) gets one row per book the app reports
// opened or saved: the book key and that word, nothing else. Neither the
// address nor the bodies are logged anywhere.

export const RELATED_RETURNED = 30;
export const OUTBOUND_CAP = 3;
export const SUGGESTIONS_DEADLINE_MS = 3_000;
export const SUGGESTION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const WORK_ID = /^OL\d+W$/;

/**
 * Response caching for the related list. Vercel's CDN reads
 * `Vercel-CDN-Cache-Control` (it takes priority there and is not passed on);
 * the browser reads `Cache-Control`. (Vercel consumes an `s-maxage` in
 * `Cache-Control` and then sends the browser `max-age=0`, so the browser's
 * day is given separately.) A complete answer: a day in both, and the CDN
 * may serve it a week longer while it refreshes in the background. A
 * complete answer with no books: an hour at the CDN and never in the
 * browser, so a passing 404 or empty answer from Open Library does not stick
 * for a day. A partial one: a minute at the CDN, so a failing Open Library is
 * not asked on every visit, and never in the browser. Errors keep the
 * router's `no-store`.
 */
export const RELATED_CACHE = Object.freeze({
  complete: Object.freeze({ 'Cache-Control': 'public, max-age=86400', 'Vercel-CDN-Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' }),
  empty: Object.freeze({ 'Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'public, max-age=3600' }),
  partial: Object.freeze({ 'Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'public, max-age=60' }),
});

/** The cache headers for a related answer: partial, empty or complete. */
export const relatedCacheFor = ({ books, partial }) => (partial ? RELATED_CACHE.partial : books.length ? RELATED_CACHE.complete : RELATED_CACHE.empty);

const text = (value, maximum) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, maximum) : null);

/** The public suggestion shape, with every field bounded; null without a key or title. */
export function suggestionBook(raw) {
  const title = text(raw?.title, 500);
  if (typeof raw?.bookKey !== 'string' || !parsePublicBookKey(raw.bookKey) || !title) return null;
  const authors = (Array.isArray(raw.authors) ? raw.authors : []).map(name => text(name, 240)).filter(Boolean).slice(0, 20);
  const coverUrl = sanitizePublicCoverUrl(raw.coverUrl);
  const isbn13 = validateAndNormalize(raw.isbn13 || '');
  return { bookKey: raw.bookKey, title, authors, ...(coverUrl ? { coverUrl } : {}), ...(isbn13 ? { isbn13 } : {}),
    ...(WORK_ID.test(raw.workId || '') ? { workId: raw.workId } : {}) };
}

/** A small in-memory cache with an expiry, plus the read in flight for each key. */
export function createTtlCache({ ttlMs = SUGGESTION_CACHE_TTL_MS, maxEntries = 2_000, now = () => Date.now() } = {}) {
  const entries = new Map();
  const running = new Map();
  return Object.freeze({
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) { entries.delete(key); return undefined; }
      return entry.value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { value, expiresAt: now() + ttlMs });
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    },
    running: key => running.get(key),
    track(key, promise) {
      running.set(key, promise);
      const done = () => { if (running.get(key) === promise) running.delete(key); };
      promise.then(done, done);
    },
    size: () => entries.size,
  });
}

// At most `cap` outbound requests for one answer.
function createBudget(cap) {
  let used = 0;
  return { take() { if (used >= cap) return false; used += 1; return true; }, used: () => used };
}

// The value, or undefined once the deadline passes or the promise fails;
// either marks the answer as partial (something could not be read).
function until(promise, run) {
  return new Promise(resolve => {
    const timer = setTimeout(() => { run.partial = true; resolve(undefined); }, Math.max(0, run.deadlineAt - Date.now()));
    Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); run.partial = true; resolve(undefined); });
  });
}

export function createSuggestionService({ reads = createOpenLibrarySuggestionReads(), peek = peekOpenLibraryRead,
  now = () => Date.now(), deadlineMs = SUGGESTIONS_DEADLINE_MS, outboundCap = OUTBOUND_CAP,
  defer = task => { Promise.resolve().then(task).catch(() => {}); } } = {}) {
  const cache = options => createTtlCache({ now, ...options });
  const records = cache({ maxEntries: 5_000 }); // book key -> { workId?, title, subjects, places, authorKeys }
  const byAuthor = cache({ maxEntries: 2_000 }); // author key -> books
  const bySubject = cache({ maxEntries: 2_000 }); // related query -> books

  // Starts one Open Library read against the budget. It keeps running after
  // the answer is sent, so its answer still reaches the cache (the platform
  // is asked to wait for it).
  function outbound(budget, task) {
    if (!budget.take()) return null;
    const promise = Promise.resolve().then(task);
    promise.catch(() => {});
    try { defer(() => promise.catch(() => {})); } catch { /* Background only. */ }
    return promise;
  }

  // Reads a cached value, joins a read in flight, or starts one (`start` may
  // return null when the budget is spent). Failures are not cached.
  function cached(target, key, start, run) {
    const hit = target.get(key);
    if (hit !== undefined) return Promise.resolve(hit);
    const running = target.running(key);
    if (running) return until(running, run);
    const read = start();
    if (!read) return Promise.resolve(undefined);
    const filled = read.then(value => { target.set(key, value); return value; });
    filled.catch(() => {});
    target.track(key, filled);
    return until(filled, run);
  }

  function identityOf(key) {
    const parsed = parsePublicBookKey(key);
    if (parsed?.kind === 'isbn') return { key, isbn: parsed.isbn13 };
    if (parsed?.kind === 'source' && parsed.source === 'openlibrary' && WORK_ID.test(parsed.sourceRecordId)) return { key, workId: parsed.sourceRecordId };
    return null;
  }

  // A work record this instance already read for another reason costs nothing.
  function alreadyRead(book) {
    if (!book.workId) return undefined;
    let work;
    try { work = peek(`/works/${book.workId}.json`); } catch { return undefined; }
    if (!work || typeof work !== 'object') return undefined;
    const value = parseWorkRecord(work, book.workId);
    records.set(book.key, value);
    return value;
  }

  const usable = book => book?.coverUrl && book.authors.length && !collectionOrTextbook(book.title, book.authors);

  /**
   * `{ books, partial }` for one book: its first author's most-read other
   * works, then the most-read works on its subject in its place, or on two
   * of its specific subjects (`relatedQuery`; never one subject alone).
   * Covers only; never the book itself or another work with its title.
   * `partial` when an Open Library read failed or missed the deadline; a
   * spent request budget is not partial.
   */
  async function related(bookKey) {
    const run = { deadlineAt: Date.now() + deadlineMs, partial: false };
    const budget = createBudget(outboundCap);
    const book = identityOf(bookKey);
    if (!book) return { books: [], partial: false };
    const record = records.get(book.key) ?? alreadyRead(book)
      ?? await cached(records, book.key, () => outbound(budget, () => (book.workId ? reads.workRecord(book.workId) : reads.isbnRecord(book.isbn))), run);
    // Nothing is suggested from a book that may not be suggested itself.
    if (!record || blockedBook(record.title, record.subjects)) return { books: [], partial: run.partial };
    const author = record.authorKeys?.[0];
    const query = relatedQuery(record);
    const [sameAuthor, sameSubject] = await Promise.all([
      author ? cached(byAuthor, author, () => outbound(budget, () => reads.authorWorks(author)), run) : undefined,
      query ? cached(bySubject, query, () => outbound(budget, () => reads.relatedWorks(query)), run) : undefined,
    ]);
    const own = new Set([book.workId, record.workId].filter(Boolean));
    const titles = new Set([titleKey(record.title)].filter(Boolean));
    const books = [];
    for (const raw of [...(Array.isArray(sameAuthor) ? sameAuthor : []), ...(Array.isArray(sameSubject) ? sameSubject : [])]) {
      if (books.length >= RELATED_RETURNED) break;
      const candidate = suggestionBook(raw);
      if (!usable(candidate) || own.has(candidate.workId)) continue;
      // The first work with a title only ("Ignited Minds" is three works).
      const key = titleKey(candidate.title);
      if (titles.has(key)) continue;
      titles.add(key);
      books.push(candidate);
    }
    return { books, partial: run.partial };
  }

  return Object.freeze({ related });
}

export function createSuggestionRoutes({ store = null, ...options } = {}) {
  // The platform's waitUntil (store.defer), so a read cut off by the deadline still fills the cache.
  const service = createSuggestionService({ ...(store?.defer ? { defer: store.defer } : {}), ...options });

  // One public book's related list, for the CDN and the browser to keep.
  async function related(req, res) {
    const { bookKey } = parseRelatedSuggestions(req.query);
    let result;
    // Fails open: whatever is known, possibly nothing; the app adds its seed list.
    try { result = await service.related(bookKey); } catch { result = { books: [], partial: true }; }
    res.set(relatedCacheFor(result));
    res.json({ books: result.books, ...(result.partial ? { partial: true } : {}) });
  }

  // Counts from the app: one book opened or saved. Written after the
  // response, only when the log is on.
  async function suggestionEvent(req, res) {
    const { event, bookKeys } = parseSuggestionEvent(req.body);
    if (store?.usage?.enabled) {
      res.once('finish', () => {
        try { for (const bookKey of bookKeys) store.usage.record({ kind: 'suggestion', bookKey, outcome: event }); } catch { /* The log never alters a response. */ }
      });
    }
    res.status(202).json({});
  }

  return Object.freeze({ related, suggestionEvent });
}
