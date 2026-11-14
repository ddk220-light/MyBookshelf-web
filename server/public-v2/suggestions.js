import seedList from '../../shared/suggestions-seed.json' with { type: 'json' };
import { parsePublicBookKey } from './contracts.js';
import { sanitizePublicCoverUrl } from './metadata.js';
import { parseSuggestionEvent, parseSuggestions } from './validation.js';
import { validateAndNormalize } from '../services/isbn.js';
import { createOpenLibrarySuggestionReads, parseSubjects } from '../services/openLibrarySuggestions.js';
import { peekOpenLibraryRead } from '../services/workDiscovery.js';

// Shelf suggestions, step B (docs/plans/2026-11-14-desktop-and-shelf-
// suggestions.md, Part 2).
//
//   POST /suggestions         { libraryId?, recentBookKeys[≤3], excludeKeys[≤200] }
//                             -> { books: [{ bookKey, title, authors, coverUrl?, isbn13?, workId?, inLibrary? }], partial? }
//   POST /suggestions/events  { event: 'opened' | 'saved', bookKey } -> 202
//
// Candidates, in order: (1) books the chosen library is known to have, from
// the catalog store's stored "found" answers (`inLibrary: true`); (2) popular
// Open Library works on a subject of the recent books. The bundled seed list
// stays in the app, last. The client makes the final pick and stays the
// authority; this applies the same exclusions and one-book-per-author rule so
// that, after the client's own, five usually remain.
//
// Never a catalog request: only answers already stored count, and a stored
// "not found" (or a check that failed) is never read here. At most
// OUTBOUND_CAP Open Library requests per suggestion request; the found lists,
// display data, subjects and subject lists are cached in this instance's
// memory for 24 hours (Vercel runs many instances, each with its own cache).
// Everything fails open: a slow or failing store or Open Library gives fewer
// books (possibly none) with 200 and `partial: true`, by SUGGESTIONS_DEADLINE_MS.
//
// The anonymous log (USAGE_LOG_ENABLED) gets one row per book for each of
// the five shown, opened or saved: the book key and that word, nothing from
// the request. The request body is never logged anywhere.

export const SUGGESTIONS_RETURNED = 15;
export const SUGGESTIONS_SHOWN = 5;
export const OUTBOUND_CAP = 3;
export const SUGGESTIONS_DEADLINE_MS = 3_000;
export const SUGGESTION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FOUND_ROWS = 60;
const FOUND_CONSIDERED = 20;
const SUBJECTS_PER_WORK = 25;
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

const SEED = Object.freeze(seedList.books.map(book => suggestionBook({ ...book, workId: book.bookKey.split(':').pop() })).filter(Boolean));

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
    has: book => bookKeys.has(book.bookKey) || Boolean(book.workId && works.has(book.workId))
      || [book.isbn13, book.matchedIsbn13].some(isbn => isbn && isbns.has(isbn)),
    /** A work the store knows by a saved edition's ISBN: its other editions are left out too. */
    addWork: workId => { if (WORK_ID.test(workId || '')) works.add(workId); },
  });
}

/**
 * Up to `limit` books from ordered candidates: never an excluded book, never
 * the same key, work or ISBN-13 twice, never two by the same first author.
 */
export function pickBooks(candidates, excluded, limit) {
  const picked = [];
  const keys = new Set(), works = new Set(), isbns = new Set(), authors = new Set();
  for (const book of candidates) {
    if (picked.length >= limit) break;
    if (!book?.bookKey || !book.title || !Array.isArray(book.authors) || excluded.has(book)) continue;
    if (keys.has(book.bookKey) || (book.workId && works.has(book.workId)) || (book.isbn13 && isbns.has(book.isbn13))) continue;
    const author = authorKey(book.authors[0]);
    if (author && authors.has(author)) continue;
    picked.push(book);
    keys.add(book.bookKey);
    if (book.workId) works.add(book.workId);
    if (book.isbn13) isbns.add(book.isbn13);
    if (author) authors.add(author);
  }
  return picked;
}

// Stored "found" rows (newest first) to book identities. A work found by one
// of its ISBNs is suggested as the work, shown with that edition's details; an
// ISBN row for that same edition is the same find and is skipped.
export function foundIdentities(rows = []) {
  const valid = Array.isArray(rows) ? rows : [];
  const matched = new Set(valid.filter(row => row?.kind === 'ol_work').map(row => validateAndNormalize(row.matchedIsbn13 || '')).filter(Boolean));
  const identities = [];
  const seen = new Set();
  for (const row of valid) {
    let identity = null;
    if (row?.kind === 'ol_work' && WORK_ID.test(row.value || '')) {
      const isbn = validateAndNormalize(row.matchedIsbn13 || '');
      if (isbn) identity = { bookKey: `v1:openlibrary:${row.value}`, workId: row.value, matchedIsbn13: isbn, isbn };
    } else if (row?.kind === 'isbn13') {
      const isbn = validateAndNormalize(row.value || '');
      if (isbn && isbn === row.value && !matched.has(isbn)) identity = { bookKey: `v1:isbn:${isbn}`, isbn13: isbn, isbn };
    }
    if (identity && !seen.has(identity.bookKey)) { seen.add(identity.bookKey); identities.push(Object.freeze(identity)); }
  }
  return identities;
}

// Subjects too broad to suggest from, and tags that are not subjects.
const GENERIC_SUBJECTS = new Set(['fiction', 'nonfiction', 'non fiction', 'general', 'literature', 'novel', 'novels', 'stories', 'short stories',
  'fiction general', 'general fiction', 'literary fiction', 'english fiction', 'fiction in english', 'english literature', 'american fiction',
  'juvenile fiction', 'juvenile literature', 'young adult fiction', 'children s fiction', 'history', 'biography', 'autobiography',
  'accessible book', 'protected daisy', 'in library', 'large type books', 'large print books', 'lending library', 'overdrive',
  'open library staff picks', 'textbooks', 'reading', 'books and reading', 'translations into english', 'popular print disabled books',
  'long now manual for civilization', 'internet archive wishlist', 'new york times bestseller', 'new york times reviewed', 'bestsellers',
  'literature and fiction', 'fiction fiction', 'thesis', 'manuscripts', 'specimens']);
const GENERIC_PART = /\b(accessible|daisy|large type|large print|in library|lending library|staff picks|overdrive|internet archive|wishlist|bestsellers?|print disabled|reading level|open library|award)\b/;
const BROAD_WORDS = new Set(['fiction', 'general', 'literature', 'novel', 'novels', 'stories', 'book', 'books', 'english', 'juvenile', 'literary', 'popular', 'and']);
const subjectWords = value => String(value || '').normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function isGenericSubject(subject) {
  if (typeof subject !== 'string' || /[:=]/.test(subject)) return true; // "nyt:…", "series:…" and similar tags
  const words = subjectWords(subject);
  if (words.length < 3 || words.length > 60 || /\d{3,}/.test(words)) return true;
  if (GENERIC_SUBJECTS.has(words) || GENERIC_PART.test(words)) return true;
  return words.split(' ').every(word => BROAD_WORDS.has(word));
}

/**
 * One or two good subjects from the recent works' subject lists (newest work
 * first): subjects shared by more of the works first, then the newest work's
 * own order. Generic subjects are skipped.
 */
export function chooseSubjects(lists, limit = 2) {
  const scores = new Map();
  lists.forEach((subjects, index) => {
    const seen = new Set();
    (Array.isArray(subjects) ? subjects : []).slice(0, SUBJECTS_PER_WORK).forEach((subject, position) => {
      const key = subjectWords(subject);
      if (seen.has(key) || isGenericSubject(subject)) return;
      seen.add(key);
      const entry = scores.get(key) || { subject: subject.trim(), works: 0, index, position };
      entry.works += 1;
      scores.set(key, entry);
    });
  });
  return [...scores.values()].sort((a, b) => b.works - a.works || a.index - b.index || a.position - b.position).slice(0, limit).map(entry => entry.subject);
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

// At most `cap` outbound requests for one suggestion request. A source may
// reserve a slot it will decide about later, so the order in which sources
// run cannot starve it.
function createBudget(cap) {
  let used = 0, reserved = 0;
  return {
    take() { if (used + reserved >= cap) return false; used += 1; return true; },
    reserve() {
      if (used + reserved >= cap) return null;
      reserved += 1;
      let open = true;
      return {
        use() { if (!open) return false; open = false; reserved -= 1; used += 1; return true; },
        release() { if (open) { open = false; reserved -= 1; } },
      };
    },
    used: () => used,
  };
}

// The value, or undefined once this request's deadline passes or the promise
// fails; either marks the answer as partial (something could not be read).
function until(promise, run) {
  return new Promise(resolve => {
    const timer = setTimeout(() => { run.partial = true; resolve(undefined); }, Math.max(0, run.deadlineAt - Date.now()));
    Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); run.partial = true; resolve(undefined); });
  });
}

export function createSuggestionService({ store = null, directory = null, reads = createOpenLibrarySuggestionReads(), peek = peekOpenLibraryRead,
  now = () => Date.now(), deadlineMs = SUGGESTIONS_DEADLINE_MS, outboundCap = OUTBOUND_CAP, seed = SEED,
  defer = store?.defer || (task => { Promise.resolve().then(task).catch(() => {}); }) } = {}) {
  const cache = options => createTtlCache({ now, ...options });
  const found = cache({ maxEntries: 500 }); // libraryId -> identities
  const display = cache({ maxEntries: 5_000 }); // ISBN-13 -> { title, authors, coverUrl? } | null
  const subjects = cache({ maxEntries: 5_000 }); // recent book key -> { workId?, subjects }
  const related = cache({ maxEntries: 1_000 }); // subject -> books

  // Starts one Open Library read against the budget (or a reserved slot). It
  // keeps running after the reader's answer is sent, so its answer still
  // reaches the cache (the platform is asked to wait for it).
  function outbound(budget, task, slot = null) {
    if (!(slot ? slot.use() : budget.take())) return null;
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

  async function foundIn(libraryId, run) {
    const listFound = store?.answers?.listFound;
    if (typeof listFound !== 'function') return [];
    // The store's own reads are bounded (pool.js); a store that is down or
    // slow means nothing is known to be found, never "not found".
    return (await cached(found, libraryId, () => Promise.resolve()
      .then(() => listFound.call(store.answers, libraryId, { limit: FOUND_ROWS })).then(foundIdentities), run)) || [];
  }

  // Source 1: books the chosen library is known to have (stored answers only).
  async function inLibrary(libraryId, excluded, run) {
    const { budget } = run;
    const none = { books: [], works: new Set() };
    if (!libraryId || !directory?.resolve?.(libraryId)) return none;
    // A library whose answers may not be stored (catalog-policies.json) has none to suggest from.
    if (store?.policyFor?.(libraryId)?.storeAnswers === false) return none;
    const slot = budget.reserve();
    try {
      const identities = await foundIn(libraryId, run);
      for (const identity of identities) if (identity.workId && excluded.has(identity)) excluded.addWork(identity.workId);
      const wanted = identities.filter(identity => !excluded.has(identity)).slice(0, FOUND_CONSIDERED);
      const missing = [...new Set(wanted.map(identity => identity.isbn))].filter(isbn => display.get(isbn) === undefined && !display.running(isbn));
      const waits = wanted.map(identity => display.running(identity.isbn)).filter(Boolean);
      // Display data for the missing editions: one Books API request for all of them.
      const batch = missing.length ? outbound(budget, () => reads.editionsByIsbn(missing), slot) : null;
      slot?.release();
      if (batch) {
        const filled = batch.then(editions => { for (const isbn of missing) display.set(isbn, editions.get(isbn) ?? null); });
        filled.catch(() => {});
        for (const isbn of missing) display.track(isbn, filled);
        waits.push(filled);
      }
      await Promise.all(waits.map(wait => until(wait, run)));
      const books = wanted.map(identity => {
        const shown = display.get(identity.isbn);
        if (!shown) return null;
        const book = suggestionBook({ ...shown, bookKey: identity.bookKey, ...(identity.workId ? { workId: identity.workId } : { isbn13: identity.isbn13 }), inLibrary: true });
        // The found edition's ISBN still rules out a saved copy of it (exclusions only).
        return book && identity.matchedIsbn13 ? { ...book, matchedIsbn13: identity.matchedIsbn13 } : book;
      }).filter(Boolean);
      return { books, works: new Set(identities.map(identity => identity.workId).filter(Boolean)) };
    } finally { slot?.release(); }
  }

  function recentIdentity(key) {
    const parsed = parsePublicBookKey(key);
    if (parsed?.kind === 'isbn') return { key, isbn: parsed.isbn13 };
    if (parsed?.kind === 'source' && parsed.source === 'openlibrary' && WORK_ID.test(parsed.sourceRecordId)) return { key, workId: parsed.sourceRecordId };
    return null; // Other records (a catalog's own, Google Books) name no Open Library subjects without a request.
  }

  // A work record this instance already read for another reason costs nothing.
  function alreadyRead(recent) {
    if (!recent.workId) return undefined;
    let work;
    try { work = peek(`/works/${recent.workId}.json`); } catch { return undefined; }
    if (!work || typeof work !== 'object') return undefined;
    const value = { workId: recent.workId, subjects: parseSubjects(work.subjects) };
    subjects.set(recent.key, value);
    return value;
  }

  // Source 2: popular works on a subject of the recent books, with a cover.
  async function relatedTo(recentBookKeys, run) {
    const { budget } = run;
    const recents = recentBookKeys.map(recentIdentity).filter(Boolean);
    let asked = false;
    // One subject read per request (the newest recent book not yet known);
    // the others are used once a later refresh has read them.
    const lists = await Promise.all(recents.map(recent => {
      const known = subjects.get(recent.key) ?? alreadyRead(recent);
      if (known !== undefined) return known;
      return cached(subjects, recent.key, () => {
        if (asked) return null;
        asked = true;
        return outbound(budget, () => (recent.workId ? reads.workSubjects(recent.workId) : reads.isbnSubjects(recent.isbn)));
      }, run);
    }));
    const own = new Set([...recents.map(recent => recent.workId), ...lists.map(list => list?.workId)].filter(Boolean));
    const books = [];
    for (const subject of chooseSubjects(lists.map(list => list?.subjects || []))) {
      const list = await cached(related, subjectWords(subject), () => outbound(budget, () => reads.subjectWorks(subject)), run);
      if (Array.isArray(list)) books.push(...list.map(suggestionBook).filter(book => book?.coverUrl && book.authors.length));
      if (books.length >= SUGGESTIONS_RETURNED * 2) break;
    }
    // The recent books themselves are not "related" to themselves.
    return books.filter(book => !own.has(book.workId));
  }

  /**
   * `{ books, partial }`: `partial` when a store or Open Library read failed
   * or missed the deadline, so the app keeps its last answer rather than
   * taking an empty one as the truth. A spent request budget is not partial.
   */
  async function suggest({ libraryId, recentBookKeys = [], excludeKeys = [] } = {}) {
    const run = { deadlineAt: Date.now() + deadlineMs, budget: createBudget(outboundCap), partial: false };
    const excluded = exclusionsOf(excludeKeys);
    const failed = fallback => () => { run.partial = true; return fallback; };
    const [library, related] = await Promise.all([
      inLibrary(libraryId, excluded, run).catch(failed({ books: [], works: new Set() })),
      relatedTo(recentBookKeys, run).catch(failed([])),
    ]);
    // A related work the store also lists as found keeps its badge.
    const marked = related.map(book => (library.works.has(book.workId) ? { ...book, inLibrary: true } : book));
    return { books: pickBooks([...library.books, ...marked], excluded, SUGGESTIONS_RETURNED), partial: run.partial };
  }

  return Object.freeze({
    suggest,
    /** The five the reader is shown with this answer: these books, then the bundled seed list. */
    shown: (books, excludeKeys = []) => pickBooks([...books, ...seed], exclusionsOf(excludeKeys), SUGGESTIONS_SHOWN),
  });
}

export function createSuggestionRoutes({ store = null, directory = null, ...options } = {}) {
  const service = createSuggestionService({ store, directory, ...options });
  // Written after the response is sent, only when the anonymous log is on.
  const record = (res, rows) => {
    if (!store?.usage?.enabled) return;
    res.once('finish', () => {
      try { for (const row of rows()) store.usage.record(row); } catch { /* The log never alters a response. */ }
    });
  };

  async function suggest(req, res) {
    const parsed = parseSuggestions(req.body);
    let result;
    // Fails open: whatever is known, possibly nothing, and the app adds its seed list.
    try { result = await service.suggest(parsed); } catch { result = { books: [], partial: true }; }
    const answer = result.books.map(({ matchedIsbn13: _matched, ...book }) => book);
    // An empty partial answer leaves the app showing its last books, which
    // this request does not know: nothing is counted as shown for it.
    if (answer.length || !result.partial) {
      record(res, () => service.shown(answer, parsed.excludeKeys).map(book => ({ kind: 'suggestion', bookKey: book.bookKey, outcome: 'shown' })));
    }
    res.json({ books: answer, ...(result.partial ? { partial: true } : {}) });
  }

  async function suggestionEvent(req, res) {
    const { event, bookKey } = parseSuggestionEvent(req.body);
    record(res, () => [{ kind: 'suggestion', bookKey, outcome: event }]);
    res.status(202).json({});
  }

  return Object.freeze({ suggest, suggestionEvent });
}
