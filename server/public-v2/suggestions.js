import seedList from '../../shared/suggestions-seed.json' with { type: 'json' };
import { parsePublicBookKey } from './contracts.js';
import { sanitizePublicCoverUrl } from './metadata.js';
import { parseSuggestionEvent, parseSuggestions } from './validation.js';
import { validateAndNormalize } from '../services/isbn.js';
import { blockedBook, createOpenLibrarySuggestionReads, parseWorkRecord, relatedQuery, titleKey } from '../services/openLibrarySuggestions.js';
import { peekOpenLibraryRead } from '../services/workDiscovery.js';

// Shelf suggestions, step B (docs/plans/2026-11-14-desktop-and-shelf-
// suggestions.md, Part 2).
//
//   POST /suggestions         { libraryId?, recentBookKeys[≤3], excludeKeys[≤200] }
//                             -> { books: [{ bookKey, title, authors, coverUrl?, isbn13?, workId?, inLibrary? }], partial? }
//   POST /suggestions/events  { event: 'shown', bookKeys[1–5] } | { event: 'opened' | 'saved', bookKey } -> 202
//
// Candidates come from public lists only, in order: books related to the
// newest recent book (its author's most-read other works, then the most-read
// works on its subject in its place, or on two of its specific subjects;
// never one subject alone), then the bundled seed list. With a library
// chosen, the catalog store is asked once which of those candidates (by Open
// Library work and ISBN-13) it holds an unexpired "found" answer for there;
// those come first with `inLibrary: true` and the rest keep their order. The
// store only lifts and badges books already on these lists and never adds a
// title of its own, so one reader's lookups never become another reader's
// suggestions. The client makes the final pick and stays the authority; this
// applies the same exclusions and one-book-per-author rule so that, after
// the client's own, five usually remain.
//
// Never a catalog request: only answers already stored count, and a stored
// "not found" (or a check that failed) is never read as absence. At most
// OUTBOUND_CAP Open Library requests per suggestion request (the recent
// work's record, the author's list, the subject-and-place list); each is
// cached in this instance's memory for 24 hours (Vercel runs many instances,
// each with its own cache). Everything fails open: a slow or failing store or
// Open Library gives fewer books (possibly none) with 200 and `partial: true`,
// by SUGGESTIONS_DEADLINE_MS.
//
// The anonymous log (USAGE_LOG_ENABLED) gets one row per book the app reports
// shown, opened or saved: the book key and that word, nothing else. The
// request bodies are never logged anywhere.

export const SUGGESTIONS_RETURNED = 15;
export const OUTBOUND_CAP = 3;
export const SUGGESTIONS_DEADLINE_MS = 3_000;
// With a library chosen, Open Library reads stop this long before the
// deadline so that the store's one read still has time.
export const STORE_SHARE_MS = 750;
export const SUGGESTION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const WORK_ID = /^OL\d+W$/;

const text = (value, maximum) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, maximum) : null);

/** The first author, compared as the client does (pickSuggestions.ts): no case, spaces or full stops. */
export function authorKey(name) {
  return String(name || '').normalize('NFKC').toLocaleLowerCase('en').replace(/[\s.]+/g, '');
}

/** The public suggestion shape, with every field bounded; null without a key or title. */
export function suggestionBook(raw) {
  const title = text(raw?.title, 500);
  if (typeof raw?.bookKey !== 'string' || !parsePublicBookKey(raw.bookKey) || !title) return null;
  const authors = (Array.isArray(raw.authors) ? raw.authors : []).map(name => text(name, 240)).filter(Boolean).slice(0, 20);
  const coverUrl = sanitizePublicCoverUrl(raw.coverUrl);
  const isbn13 = validateAndNormalize(raw.isbn13 || '');
  return { bookKey: raw.bookKey, title, authors, ...(coverUrl ? { coverUrl } : {}), ...(isbn13 ? { isbn13 } : {}),
    ...(WORK_ID.test(raw.workId || '') ? { workId: raw.workId } : {}), ...(raw.inLibrary === true ? { inLibrary: true } : {}) };
}

/** The bundled seed list (shared/suggestions-seed.json), as suggestion books with their work IDs. */
export const SEED = Object.freeze(seedList.books.map(book => suggestionBook({ ...book, workId: book.bookKey.split(':').pop() })).filter(Boolean));

// The keys a reader has saved, and the works and ISBN-13s those keys name
// (display only: another edition of a saved book is not suggested).
export function exclusionsOf(keys = []) {
  const bookKeys = new Set(), works = new Set(), isbns = new Set();
  for (const key of keys) {
    bookKeys.add(key);
    const parsed = parsePublicBookKey(key);
    if (parsed?.kind === 'isbn') isbns.add(parsed.isbn13);
    if (parsed?.kind === 'source' && parsed.source === 'openlibrary' && WORK_ID.test(parsed.sourceRecordId)) works.add(parsed.sourceRecordId);
  }
  return Object.freeze({
    has: book => bookKeys.has(book.bookKey) || Boolean(book.workId && works.has(book.workId)) || Boolean(book.isbn13 && isbns.has(book.isbn13)),
  });
}

/**
 * Up to `limit` books from ordered candidates: never an excluded book, never
 * the same key, work or ISBN-13 twice and, unless `oneAuthor` is false, never
 * two by the same first author.
 */
export function pickBooks(candidates, excluded, limit, { oneAuthor = true } = {}) {
  const picked = [];
  const keys = new Set(), works = new Set(), isbns = new Set(), authors = new Set();
  for (const book of candidates) {
    if (picked.length >= limit) break;
    if (!book?.bookKey || !book.title || !Array.isArray(book.authors) || excluded.has(book)) continue;
    if (keys.has(book.bookKey) || (book.workId && works.has(book.workId)) || (book.isbn13 && isbns.has(book.isbn13))) continue;
    const author = oneAuthor ? authorKey(book.authors[0]) : '';
    if (author && authors.has(author)) continue;
    picked.push(book);
    keys.add(book.bookKey);
    if (book.workId) works.add(book.workId);
    if (book.isbn13) isbns.add(book.isbn13);
    if (author) authors.add(author);
  }
  return picked;
}

/** The store identities a candidate can be found by: its Open Library work and its ISBN-13. */
export function candidateIdentities(books) {
  const seen = new Set();
  const identities = [];
  const add = (kind, value) => { const key = kind + ':' + value; if (!seen.has(key)) { seen.add(key); identities.push({ kind, value }); } };
  for (const book of books) {
    if (WORK_ID.test(book.workId || '')) add('ol_work', book.workId);
    const isbn = validateAndNormalize(book.isbn13 || '');
    if (isbn) add('isbn13', isbn);
  }
  return identities;
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

// At most `cap` outbound requests for one suggestion request.
function createBudget(cap) {
  let used = 0;
  return { take() { if (used >= cap) return false; used += 1; return true; }, used: () => used };
}

// The value, or undefined once `deadlineAt` passes or the promise fails;
// either marks the answer as partial (something could not be read).
function until(promise, run, deadlineAt = run.deadlineAt) {
  return new Promise(resolve => {
    const timer = setTimeout(() => { run.partial = true; resolve(undefined); }, Math.max(0, deadlineAt - Date.now()));
    Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); run.partial = true; resolve(undefined); });
  });
}

export function createSuggestionService({ store = null, directory = null, reads = createOpenLibrarySuggestionReads(), peek = peekOpenLibraryRead,
  now = () => Date.now(), deadlineMs = SUGGESTIONS_DEADLINE_MS, outboundCap = OUTBOUND_CAP, seed = SEED, storeShareMs = STORE_SHARE_MS,
  defer = store?.defer || (task => { Promise.resolve().then(task).catch(() => {}); }) } = {}) {
  const cache = options => createTtlCache({ now, ...options });
  const records = cache({ maxEntries: 5_000 }); // recent book key -> { workId?, title, subjects, places, authorKeys }
  const byAuthor = cache({ maxEntries: 2_000 }); // author key -> books
  const bySubject = cache({ maxEntries: 2_000 }); // related query -> books

  // Starts one Open Library read against the budget. It keeps running after
  // the reader's answer is sent, so its answer still reaches the cache (the
  // platform is asked to wait for it).
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
    if (running) return until(running, run, run.readBy);
    const read = start();
    if (!read) return Promise.resolve(undefined);
    const filled = read.then(value => { target.set(key, value); return value; });
    filled.catch(() => {});
    target.track(key, filled);
    return until(filled, run, run.readBy);
  }

  // The chosen library, when its stored answers may be read: a library in
  // the directory whose answers may be stored (catalog-policies.json).
  function storedLibrary(libraryId) {
    if (!libraryId || !directory?.resolve?.(libraryId)) return null;
    if (store?.policyFor?.(libraryId)?.storeAnswers === false) return null;
    return typeof store?.answers?.readAnswers === 'function' ? libraryId : null;
  }

  /**
   * The candidates' book keys that the store holds an unexpired "found"
   * answer for at this library, in one read. Only these candidates are
   * asked about; a "not found", or a store that is slow or down, is simply
   * no badge, never absence.
   */
  async function foundAmong(libraryId, books, run) {
    const identities = candidateIdentities(books);
    if (!identities.length) return new Set();
    const rows = await until(Promise.resolve().then(() => store.answers.readAnswers(libraryId, identities)), run);
    const works = new Set(), isbns = new Set();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row?.answer !== 'found' || (row.libraryId !== undefined && row.libraryId !== libraryId)) continue;
      if (row.kind === 'ol_work') works.add(row.value);
      if (row.kind === 'isbn13') isbns.add(row.value);
    }
    return new Set(books.filter(book => (book.workId && works.has(book.workId)) || (book.isbn13 && isbns.has(book.isbn13))).map(book => book.bookKey));
  }

  function recentIdentity(key) {
    const parsed = parsePublicBookKey(key);
    if (parsed?.kind === 'isbn') return { key, isbn: parsed.isbn13 };
    if (parsed?.kind === 'source' && parsed.source === 'openlibrary' && WORK_ID.test(parsed.sourceRecordId)) return { key, workId: parsed.sourceRecordId };
    return null;
  }

  // A work record this instance already read for another reason costs nothing.
  function alreadyRead(recent) {
    if (!recent.workId) return undefined;
    let work;
    try { work = peek(`/works/${recent.workId}.json`); } catch { return undefined; }
    if (!work || typeof work !== 'object') return undefined;
    const value = parseWorkRecord(work, recent.workId);
    records.set(recent.key, value);
    return value;
  }

  const usable = book => book?.coverUrl && book.authors.length;

  /**
   * Related books, for the newest recent book: its first author's most-read
   * other works, then the most-read works on its subject in its place, or on
   * two of its specific subjects (`relatedQuery`; never one subject alone).
   * Covers only; never the book itself or another work with its title.
   */
  async function relatedTo(recentBookKeys, run) {
    const { budget } = run;
    const recents = recentBookKeys.map(recentIdentity).filter(Boolean);
    const recent = recents[0];
    if (!recent) return [];
    const record = records.get(recent.key) ?? alreadyRead(recent)
      ?? await cached(records, recent.key, () => outbound(budget, () => (recent.workId ? reads.workRecord(recent.workId) : reads.isbnRecord(recent.isbn))), run);
    // Nothing is suggested from a book that may not be suggested itself.
    if (!record || blockedBook(record.title, record.subjects)) return [];
    const author = record.authorKeys?.[0];
    const query = relatedQuery(record);
    const [sameAuthor, sameSubject] = await Promise.all([
      author ? cached(byAuthor, author, () => outbound(budget, () => reads.authorWorks(author)), run) : undefined,
      query ? cached(bySubject, query, () => outbound(budget, () => reads.relatedWorks(query)), run) : undefined,
    ]);
    const own = new Set([...recents.map(item => item.workId), record.workId].filter(Boolean));
    const titles = new Set([titleKey(record.title)].filter(Boolean));
    const books = [];
    for (const raw of [...(Array.isArray(sameAuthor) ? sameAuthor : []), ...(Array.isArray(sameSubject) ? sameSubject : [])]) {
      const book = suggestionBook(raw);
      if (!usable(book) || own.has(book.workId)) continue;
      // The first work with a title only ("Ignited Minds" is three works).
      const key = titleKey(book.title);
      if (titles.has(key)) continue;
      titles.add(key);
      books.push(book);
    }
    return books;
  }

  /**
   * `{ books, partial }`: `partial` when a store or Open Library read failed
   * or missed the deadline, so the app keeps its last books as well rather
   * than taking this answer as the whole truth. A spent request budget is
   * not partial.
   */
  async function suggest({ libraryId, recentBookKeys = [], excludeKeys = [] } = {}) {
    const library = storedLibrary(libraryId);
    const deadlineAt = Date.now() + deadlineMs;
    const run = { deadlineAt, readBy: library ? deadlineAt - Math.min(storeShareMs, deadlineMs / 2) : deadlineAt, budget: createBudget(outboundCap), partial: false };
    const excluded = exclusionsOf(excludeKeys);
    const related = await relatedTo(recentBookKeys, run).catch(() => { run.partial = true; return []; });
    // Every candidate once, in list order (the one-per-author rule comes last,
    // so that a book the library has can win over another by its author).
    const pool = pickBooks([...related, ...seed], excluded, Infinity, { oneAuthor: false });
    const found = library ? await foundAmong(library, pool, run).catch(() => { run.partial = true; return new Set(); }) : new Set();
    const ordered = [...pool.filter(book => found.has(book.bookKey)).map(book => ({ ...book, inLibrary: true })), ...pool.filter(book => !found.has(book.bookKey))];
    return { books: pickBooks(ordered, excluded, SUGGESTIONS_RETURNED), partial: run.partial };
  }

  return Object.freeze({ suggest });
}

export function createSuggestionRoutes({ store = null, directory = null, ...options } = {}) {
  const service = createSuggestionService({ store, directory, ...options });

  async function suggest(req, res) {
    const parsed = parseSuggestions(req.body);
    let result;
    // Fails open: whatever is known, possibly nothing, and the app adds its seed list.
    try { result = await service.suggest(parsed); } catch { result = { books: [], partial: true }; }
    res.json({ books: result.books, ...(result.partial ? { partial: true } : {}) });
  }

  // Counts from the app: the five it showed for one refresh, or one book
  // opened or saved. Written after the response, only when the log is on.
  async function suggestionEvent(req, res) {
    const { event, bookKeys } = parseSuggestionEvent(req.body);
    if (store?.usage?.enabled) {
      res.once('finish', () => {
        try { for (const bookKey of bookKeys) store.usage.record({ kind: 'suggestion', bookKey, outcome: event }); } catch { /* The log never alters a response. */ }
      });
    }
    res.status(202).json({});
  }

  return Object.freeze({ suggest, suggestionEvent });
}
