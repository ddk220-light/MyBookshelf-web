import { parsePublicBookKey, publicError } from './contracts.js';
import { catalogHandoffFor } from './catalog-handoff.js';
import { validateAndNormalize } from '../services/isbn.js';
import { identitiesFor, askedIdentity, storedAnswer } from '../services/catalog-lookup/record.js';
import { parseLibraryRequest, parseProblemReport, SubmissionError } from '../catalog-store/requests.js';
import { PublicV2ValidationError, parseHoldingsCheck, parseHoldingsLookup, parseHoldingsSearch } from './validation.js';

// Holdings and submission routes (plan 3.5, 5.7). Still cookie-free: they
// use the anonymous catalog store, never the account database.
//
//   POST /holdings/lookup  stored answers only, no catalog request (shelf badges)
//   POST /holdings/check   stored answer, else one live check (book page)
//   POST /holdings/search  NDJSON result marking (background check for results)
//   POST /library-requests one-tap request to add a library: text and a count
//   POST /problem-reports  report a problem
//
// The app's answers: found, not_found, unconfirmed (the catalog answered but
// did not prove this edition: "Couldn't confirm"), unknown (couldn't check).
// A failed, cancelled or timed-out check is never "not found", and a "not
// found" for one ISBN is never presented as "the library does not have this
// work".

const WORK_ID = /^OL\d+W$/;
const SEARCH_CAP_MS = 25_000; // the whole result-marking response ends by 25 s (5.7)
const PROFILE_WAIT_MS = 10_000;

const settleWithin = (promise, ms) => new Promise(resolve => {
  const timer = setTimeout(() => resolve(null), Math.max(0, ms));
  Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value ?? null); }, () => { clearTimeout(timer); resolve(null); });
});

// Identity carried by a book key on its own (an ISBN key or an Open Library
// work key) and, for this library's own record, the record ID.
function keyIdentity(libraryId, bookKey) {
  const parsed = parsePublicBookKey(bookKey);
  const identity = { bookKey };
  if (parsed?.kind === 'isbn') identity.isbn13 = parsed.isbn13;
  if (parsed?.kind === 'source' && parsed.source === 'openlibrary' && WORK_ID.test(parsed.sourceRecordId)) identity.workId = parsed.sourceRecordId;
  if (parsed?.kind === 'catalog' && parsed.libraryId === libraryId) Object.assign(identity, { recordId: parsed.recordId, recordLibraryId: libraryId });
  return identity;
}

// Identity from the server's own resolution of the book key (never from the
// client), so a stored answer can only be written for what the key names.
function trustedIdentity(libraryId, bookKey, resolved) {
  const identity = keyIdentity(libraryId, bookKey);
  const isbn13 = validateAndNormalize(resolved?.isbn13 || '');
  if (isbn13 && !identity.isbn13) identity.isbn13 = isbn13;
  if (WORK_ID.test(resolved?.workId || '') && !identity.workId) identity.workId = resolved.workId;
  return identity;
}

// A "not found" for one ISBN answers only a book asked about by that ISBN.
// For a work (a book with an Open Library work ID) it means only that this
// edition is not listed.
function definiteNotFound(answer, book, libraryId) {
  if (answer.outcome !== 'not_found') return false;
  if (answer.evidence !== 'isbn_not_listed') return true;
  return askedIdentity(libraryId, book, 'work')?.kind === 'isbn13';
}

export function appAnswer(answer, book, libraryId) {
  if (answer?.outcome === 'found') return 'found';
  if (answer?.outcome === 'not_found') return definiteNotFound(answer, book, libraryId) ? 'not_found' : 'unconfirmed';
  if (answer?.outcome === 'couldnt_check' && answer.reason === 'unconfirmed') return 'unconfirmed';
  return 'unknown';
}

// A promise-like value that starts its work the first time it is awaited.
function lazyProfile(start) {
  let promise = null;
  const run = () => (promise ||= start ? Promise.resolve().then(start) : Promise.resolve(null));
  return { then: (resolve, reject) => run().then(resolve, reject) };
}

const safeCatalogUrl = value => {
  if (typeof value !== 'string' || value.length > 2000) return undefined;
  try { return ['http:', 'https:'].includes(new URL(value).protocol) ? value : undefined; } catch { return undefined; }
};

export function createHoldingsRoutes({ directory, books, lookup, store, now = () => Date.now(), searchCapMs = SEARCH_CAP_MS }) {
  const usage = event => { try { store.usage.record(event); } catch { /* The log never alters a response. */ } };
  const readStored = async (libraryId, identities) => {
    if (!identities.length || store.policyFor(libraryId)?.storeAnswers === false) return [];
    try {
      const rows = await store.answers.readAnswers(libraryId, identities);
      return Array.isArray(rows) ? rows : [];
    } catch { return []; } // Store down: nothing stored, never "not found".
  };

  function libraryFor(libraryId) {
    const library = directory.resolve(libraryId);
    const entry = directory.entry?.(libraryId);
    return library && entry ? { library, entry } : null;
  }

  // Shelf badges: stored answers only, one database read, no catalog request.
  async function holdingsLookup(req, res) {
    const startedAt = now();
    const { libraryId, books: items } = parseHoldingsLookup(req.body);
    if (!libraryFor(libraryId)) return res.status(404).json(publicError('LIBRARY_NOT_FOUND', 'This library is not in the directory.'));
    const shelf = items.map(item => ({ ...keyIdentity(libraryId, item.bookKey), ...(item.isbn13 ? { isbn13: item.isbn13 } : {}),
      ...(item.workId ? { workId: item.workId } : {}) }));
    const key = id => `${id.kind}\u0000${id.value}`;
    const identitiesOf = new Map(shelf.map(book => [book.bookKey, identitiesFor(libraryId, book)]));
    const rows = await readStored(libraryId, [...new Map([...identitiesOf.values()].flat().map(id => [key(id), id])).values()]);
    const answers = {};
    for (const book of shelf) {
      const own = new Set(identitiesOf.get(book.bookKey).map(key));
      const stored = storedAnswer(rows.filter(row => own.has(key(row))), askedIdentity(libraryId, book, 'work'));
      if (stored?.outcome === 'found') answers[book.bookKey] = 'found';
      else if (stored && definiteNotFound(stored, book, libraryId)) answers[book.bookKey] = 'not_found';
    }
    res.json({ answers });
    return { durationMs: now() - startedAt };
  }

  // Book page: stored answer, else one live check through the lookup layer.
  async function holdingsCheck(req, res) {
    const startedAt = now();
    const { libraryId, bookKey, parsed } = parseHoldingsCheck(req.body);
    const found = libraryFor(libraryId);
    if (!found) return res.status(404).json(publicError('LIBRARY_NOT_FOUND', 'This library is not in the directory.'));
    const { library, entry } = found;
    let resolved = null, metadataFailed = false;
    try { resolved = await books.resolve(bookKey); } catch { metadataFailed = true; }
    if (!resolved && !metadataFailed) return res.status(404).json(publicError('BOOK_NOT_FOUND', 'No public book details were found.'));
    const book = { ...trustedIdentity(libraryId, bookKey, resolved), title: resolved?.title || '', authors: resolved?.authors || [] };
    const handoff = catalogHandoffFor({ entry, library, book: resolved || (book.isbn13 ? { isbn13: book.isbn13 } : undefined) });
    const reply = (answer, source, extraUrl) => {
      const catalogUrl = safeCatalogUrl(extraUrl) || safeCatalogUrl(handoff?.catalogUrl);
      res.json({ answer, ...(catalogUrl ? { catalogUrl } : {}) });
      usage({ kind: 'book_check', libraryId, bookKey, outcome: answer, ...(source ? { source } : {}), durationMs: now() - startedAt });
    };
    const stored = await lookup.storedFor({ library: entry, book });
    if (stored) return reply(appAnswer(stored, book, libraryId), 'stored', stored.catalogUrl);
    // Metadata unavailable and nothing in the key to check by: couldn't check.
    if (!library.capabilities?.publicAvailability || (metadataFailed && !book.isbn13 && !book.recordId)) return reply('unknown', null);
    const controller = new AbortController();
    const abandon = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', abandon);
    try {
      // The edition profile (Open Library) is resolved here, outside the
      // catalog lookup, so it never uses a catalog's time or request budget.
      const profile = book.recordId || metadataFailed ? null
        : await settleWithin(books.searchProfile?.(bookKey, { editionScope: 'work' }), PROFILE_WAIT_MS);
      const answer = await lookup.lookupBook({ library: entry, publicLibrary: library, book, ...(profile ? { profile } : {}),
        editionScope: 'work', signal: controller.signal, storedChecked: true });
      if (controller.signal.aborted) return undefined;
      return reply(appAnswer(answer, book, libraryId), answer.source || 'live', answer.catalogUrl);
    } finally {
      res.off('close', abandon);
    }
  }

  // Background check for search results (5.7): NDJSON lines
  //   {"type":"mark","bookKey":"…","answer":"found"}   one per found book
  //   {"type":"done","unchecked":["…"]}                 always last
  // `unchecked` lists every book without an answer from this run or the store
  // (not attempted, no matching row, or only one ISBN not listed). No mark
  // never means "not in the library".
  const identify = key => (typeof books.summary === 'function' ? books.summary(key) : books.resolve(key));

  async function holdingsSearch(req, res) {
    const startedAt = now();
    const deadlineAt = startedAt + searchCapMs;
    const { libraryId, query, books: items } = parseHoldingsSearch(req.body);
    const found = libraryFor(libraryId);
    if (!found) return res.status(404).json(publicError('LIBRARY_NOT_FOUND', 'This library is not in the directory.'));
    const { library, entry } = found;
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const write = line => { if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(line)}\n`); };
    const keys = items.map(item => item.bookKey);
    const marked = new Set(), answered = new Set();
    const sources = new Set();
    const finish = outcome => {
      write({ type: 'done', unchecked: keys.filter(key => !marked.has(key) && !answered.has(key)) });
      if (!res.writableEnded) res.end();
      usage({ kind: 'result_marks', queryText: query, libraryId, outcome, resultCount: keys.length, foundCount: marked.size,
        ...(sources.size ? { source: sources.size > 1 ? 'mixed' : [...sources][0] } : {}), durationMs: now() - startedAt });
    };
    if (!store.config.backgroundChecksEnabled || store.policyFor(libraryId)?.backgroundChecks === false || !library.capabilities?.publicAvailability) {
      return finish('skipped');
    }
    const controller = new AbortController();
    const abandon = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', abandon);
    let iterator = null, capTimer;
    try {
      // Identities come from the server's own record of each key: the search
      // that produced these results has cached each book's title, authors and
      // work ID, which is all marking needs (`summary`); a full resolution
      // would cost paced Open Library reads per book before the catalog
      // search could start.
      // A library catalog record key is never resolved here: resolving it reads
      // that library's catalog outside every request budget, host gate and
      // circuit, and twelve keys per request would let anyone hammer a
      // catalog. Such a book is answered from the store by its own record, or
      // when it is opened.
      const resolutions = new Map(keys.map(key => [key, parsePublicBookKey(key)?.kind === 'catalog' ? Promise.resolve(null)
        : settleWithin(identify(key), Math.min(PROFILE_WAIT_MS, deadlineAt - now()))]));
      const list = await Promise.all(items.map(async item => {
        const resolved = await resolutions.get(item.bookKey);
        const identity = trustedIdentity(libraryId, item.bookKey, resolved);
        // Edition profiles are Open Library reads outside the catalog's budget.
        // They start only when marking runs (lazily: not for stored answers, a
        // platform without a results strategy or an open circuit), in parallel
        // with the catalog search. A profile that fails means that book cannot
        // be matched (no badge), never "not found".
        return { ...identity, title: resolved?.title || '', authors: resolved?.authors || [],
          profile: lazyProfile(resolved && typeof books.searchProfile === 'function' ? () => books.searchProfile(item.bookKey, { editionScope: 'work' }) : null) };
      }));
      const byKey = new Map(list.map(book => [book.bookKey, book]));
      iterator = lookup.markResults({ library: entry, publicLibrary: library, query, books: list, signal: controller.signal, deadlineAt })[Symbol.asyncIterator]();
      const capped = new Promise(resolve => { capTimer = setTimeout(() => resolve({ capped: true }), Math.max(0, deadlineAt - now())); });
      let outcome = 'done';
      while (true) {
        const step = await Promise.race([iterator.next(), capped]);
        if (step.capped) { outcome = 'partial'; controller.abort(); break; }
        if (step.done) break;
        const item = step.value;
        if (item.done) break;
        if (controller.signal.aborted) { outcome = 'partial'; break; }
        if (item.source) sources.add(item.source);
        const book = byKey.get(item.bookKey);
        if (item.outcome === 'found') {
          marked.add(item.bookKey);
          write({ type: 'mark', bookKey: item.bookKey, answer: 'found' });
        } else if (item.outcome === 'not_found' && book && definiteNotFound(item, book, libraryId)) {
          answered.add(item.bookKey);
        }
      }
      return finish(outcome);
    } catch {
      // Headers are sent: end the stream with every unanswered book unchecked.
      return finish('partial');
    } finally {
      clearTimeout(capTimer);
      res.off('close', abandon);
      // Ends the lookup run (frees the host's marking slot) without waiting.
      if (iterator?.return) Promise.resolve().then(() => iterator.return()).catch(() => {});
    }
  }

  function submission(handler) {
    return async (req, res) => {
      let parsed;
      try { parsed = handler.parse(req.body); }
      catch (error) {
        if (error instanceof SubmissionError) throw new PublicV2ValidationError();
        throw error;
      }
      const result = await handler.submit(parsed, { address: req.ip });
      if (result === 'limited') return res.status(429).json(publicError('RATE_LIMITED', 'Please wait before trying again.'));
      return res.status(202).json({});
    };
  }

  return Object.freeze({
    holdingsLookup,
    holdingsCheck,
    holdingsSearch,
    libraryRequest: submission({ parse: parseLibraryRequest, submit: (value, context) => store.submissions.libraryRequest(value, context) }),
    problemReport: submission({ parse: parseProblemReport, submit: (value, context) => store.submissions.problemReport(value, context) }),
  });
}
