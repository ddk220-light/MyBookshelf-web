import { Router } from 'express';
import { createPublicAvailabilityService } from './availability.js';
import { publicError } from './contracts.js';
import { createPublicDirectoryService } from './directory.js';
import { createPublicBookService } from './metadata.js';
import { createPublicCatalogBookService } from './catalogBooks.js';
import { createDiscoveryService } from './discovery.js';
import { createPlaceSearch } from './places.js';
import { createRedactedTelemetrySink } from './telemetry.js';
import { mountContentRoutes } from './content.js';
import { createCatalogLookup } from '../services/catalog-lookup/index.js';
import { createLookupRecorder } from '../services/catalog-lookup/record.js';
import { createCatalogStore } from '../catalog-store/index.js';
import { createHoldingsRoutes } from './holdings.js';
import { createSuggestionRoutes } from './suggestions.js';
import {
  PublicV2ValidationError,
  parseAvailability,
  parseBookResolve,
  parseBookSearch,
  parseLibraryResolve,
  parseLibrarySelection,
  parseLibrarySearch,
  parseLibraryBrowse,
  parseDiscovery,
  parsePlaceSearch,
} from './validation.js';

function createIpRateLimiter({ limit = 60, windowMs = 60_000, now = () => Date.now() } = {}) {
  const entries = new Map();
  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const current = entries.get(key);
    const value = !current || current.resetAt <= now() ? { count: 0, resetAt: now() + windowMs } : current;
    value.count += 1;
    entries.set(key, value);
    if (entries.size > 5_000) {
      for (const [ip, entry] of entries) if (entry.resetAt <= now()) entries.delete(ip);
    }
    if (value.count > limit) return res.status(429).json(publicError('RATE_LIMITED', 'Please wait before trying again.'));
    return next();
  };
}

function emit(telemetry, event) {
  try { telemetry.emit(event); } catch { /* Telemetry can never alter a lookup response. */ }
}

function route(telemetry, operation, handler) {
  return async (req, res) => {
    const startedAt = Date.now();
    try {
      await handler(req, res);
      emit(telemetry, { operation, outcome: String(res.statusCode), durationMs: Date.now() - startedAt });
    } catch (error) {
      if (error instanceof PublicV2ValidationError) {
        res.status(400).json(publicError('INVALID_REQUEST', 'The request is invalid.'));
        emit(telemetry, { operation, outcome: '400', errorCode: 'INVALID_REQUEST', durationMs: Date.now() - startedAt });
        return;
      }
      if (error?.code === 'BOOK_METADATA_UNAVAILABLE') {
        res.status(503).json(publicError('METADATA_UNAVAILABLE', 'Book details are temporarily unavailable.'));
        emit(telemetry, { operation, outcome: '503', errorCode: 'METADATA_UNAVAILABLE', durationMs: Date.now() - startedAt });
        return;
      }
      if (error?.code === 'CATALOG_UNSUPPORTED') {
        res.status(400).json(publicError('CATALOG_UNSUPPORTED', 'Title search is not available for this library. Choose All books to search.'));
        emit(telemetry, { operation, outcome: '400', errorCode: 'CATALOG_UNSUPPORTED', durationMs: Date.now() - startedAt });
        return;
      }
      if (error?.code === 'CATALOG_QUERY_UNSUPPORTED') {
        // The catalog answered that it cannot run this search (for example
        // native-script text); that is not an outage and not an empty result.
        res.status(400).json(publicError('CATALOG_QUERY_UNSUPPORTED', 'This library’s catalog searches only in English (Latin) letters. Try a romanised spelling, or search All books.'));
        emit(telemetry, { operation, outcome: '400', errorCode: 'CATALOG_QUERY_UNSUPPORTED', durationMs: Date.now() - startedAt });
        return;
      }
      if (error?.code === 'PLACE_SEARCH_UNAVAILABLE') {
        res.status(503).json(publicError(error.code, error.message));
        emit(telemetry, { operation, outcome: '503', errorCode: error.code, durationMs: Date.now() - startedAt });
        return;
      }
      const code = error?.code === 'CATALOG_TIMEOUT' ? 'CATALOG_TIMEOUT' : 'CATALOG_UNAVAILABLE';
      res.status(503).json(publicError(code, code === 'CATALOG_TIMEOUT' ? 'The catalog timed out. Please try again.' : 'The public catalog is temporarily unavailable.'));
      emit(telemetry, { operation, outcome: '503', errorCode: code, durationMs: Date.now() - startedAt });
    }
  };
}

// The operational log (catalog-store/usageLog.js) is written after the
// response is sent, only when USAGE_LOG_ENABLED is on. It is the only place
// search text is stored; telemetry and platform logs never carry it.
function afterResponse(res, store, event) {
  if (!store.usage.enabled) return;
  res.once('finish', () => {
    try { const value = event(); if (value) store.usage.record(value); } catch { /* The log never alters a response. */ }
  });
}

// `/api/v2` neither reads nor creates identity state. It uses the anonymous
// catalog store (stored answers, library health, the anonymous log and
// submissions), never the account database.
export function createPublicV2Router({
  directory = createPublicDirectoryService(),
  discovery = createDiscoveryService(),
  places = createPlaceSearch(),
  books = null,
  availability = null,
  rateLimit = {},
  telemetry = createRedactedTelemetrySink(),
  content,
  catalogStore = null,
  lookup = null,
  holdingsOptions = {},
  suggestionOptions = {},
} = {}) {
  const router = Router();
  const bookService = books || createPublicBookService({ catalogs: createPublicCatalogBookService({ directory }) });
  // Without a configured database the store keeps answers and health in this
  // instance's memory, drops the log and holds submissions in memory.
  const store = catalogStore || createCatalogStore();
  const catalogLookup = lookup || createCatalogLookup({
    recorder: createLookupRecorder({ answers: store.answers, health: store.health, telemetry, policyFor: store.policyFor, defer: store.defer }),
    hostGate: store.hostGate,
  });
  const availabilityService = availability || createPublicAvailabilityService({ directory, books: bookService, lookup: catalogLookup });
  const holdings = createHoldingsRoutes({ directory, books: bookService, lookup: catalogLookup, store, ...holdingsOptions });
  // Shelf suggestions: stored answers and Open Library only, never a catalog request.
  const suggestions = createSuggestionRoutes({ directory, store, ...suggestionOptions });

  router.use((req, res, next) => {
    // This boundary neither reads nor creates identity state. These headers also
    // prevent a public lookup response being stored as a personal browser cache.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  router.use(createIpRateLimiter(rateLimit));
  mountContentRoutes(router, content);

  router.post('/places/search', route(telemetry, 'place_search', async (req, res) => {
    const startedAt = Date.now();
    const parsed = parsePlaceSearch(req.body);
    const found = await places(parsed);
    afterResponse(res, store, () => ({ kind: 'library_finder', queryText: parsed.query, outcome: found.length ? 'results' : 'none',
      resultCount: found.length, durationMs: Date.now() - startedAt }));
    res.json({ places: found });
  }));

  router.post('/libraries/discover', route(telemetry, 'directory_search', async (req, res) => {
    const startedAt = Date.now();
    const parsed = parseDiscovery(req.body);
    const result = discovery.search(parsed);
    // "Near me" is a count only: never the coordinates or any text.
    const nearMe = parsed.lat !== undefined;
    if (nearMe || parsed.query) {
      afterResponse(res, store, () => ({ kind: nearMe ? 'near_me' : 'library_finder', ...(nearMe ? {} : { queryText: parsed.query }),
        outcome: result.total ? 'results' : 'none', resultCount: result.total || 0, durationMs: Date.now() - startedAt }));
    }
    res.json(result);
  }));
  router.post('/libraries/areas', route(telemetry, 'directory_browse', async (req, res) => {
    res.json(discovery.areas(parseDiscovery(req.body)));
  }));

  router.post('/libraries/search', route(telemetry, 'directory_search', async (req, res) => {
    const { query, limit } = parseLibrarySearch(req.body);
    res.json({ libraries: directory.search(query, limit) });
  }));

  router.post('/libraries/browse', route(telemetry, 'directory_browse', async (req, res) => {
    res.json(directory.browse(parseLibraryBrowse(req.body)));
  }));

  router.post('/libraries/resolve', route(telemetry, 'directory_resolve', async (req, res) => {
    const { libraryId } = parseLibraryResolve(req.body);
    const library = directory.resolve(libraryId);
    if (!library) return res.status(404).json(publicError('LIBRARY_NOT_FOUND', 'This library is not in the directory.'));
    return res.json({ library });
  }));

  router.post('/libraries/resolve-link', route(telemetry, 'directory_resolve', async (req, res) => {
    const { slug } = parseLibrarySelection(req.body);
    const library = directory.resolveSelection(slug);
    if (!library) return res.status(404).json(publicError('LIBRARY_NOT_FOUND', 'This library link was not found.'));
    return res.json({ library });
  }));

  router.post('/books/search', route(telemetry, 'book_search', async (req, res) => {
    const startedAt = Date.now();
    const parsed = parseBookSearch(req.body);
    if (parsed.libraryId && !directory.resolve(parsed.libraryId)) return res.status(404).json(publicError('LIBRARY_NOT_FOUND', 'This library is not in the directory.'));
    // Logged after the response, success or failure (only the first page).
    if (!parsed.offset) {
      afterResponse(res, store, () => {
        const count = res.locals.bookResults;
        return { kind: 'book_search', queryText: parsed.query, ...(parsed.libraryId ? { libraryId: parsed.libraryId } : {}),
          outcome: res.statusCode >= 500 ? 'error' : count ? 'results' : 'none', ...(Number.isInteger(count) ? { resultCount: count } : {}),
          source: parsed.libraryId ? 'live' : 'public_data', durationMs: Date.now() - startedAt };
      });
    }
    const result = await bookService.search(parsed);
    res.locals.bookResults = result.kind === 'exact' ? 1 : Array.isArray(result.candidates) ? result.candidates.length : 0;
    if (result.kind === 'invalid') return res.status(400).json(publicError('INVALID_REQUEST', 'Enter a valid ISBN or search by title or author.'));
    if (result.kind === 'not_found') return res.status(404).json(publicError('BOOK_NOT_FOUND', 'No public book details were found.'));
    return res.json(result);
  }));

  router.post('/books/enrich', route(telemetry, 'book_resolve', async (req, res) => {
    const { bookKey, parsed } = parseBookResolve(req.body);
    if (!bookKey || parsed?.kind !== 'catalog') return res.status(400).json(publicError('INVALID_REQUEST', 'Choose a catalog book.'));
    const book = await bookService.enrich(bookKey);
    if (!book) return res.status(404).json(publicError('BOOK_NOT_FOUND', 'No public book details were found.'));
    return res.json({ book });
  }));

  router.post('/books/resolve', route(telemetry, 'book_resolve', async (req, res) => {
    const { bookKey, parsed } = parseBookResolve(req.body);
    if (!bookKey) return res.status(404).json(publicError('BOOK_NOT_FOUND', 'No public book details were found.'));
    let book;
    if (parsed.kind === 'catalog') {
      // A library's own record is read only for that library, named in the
      // request, and under its host slot and request cap.
      if (req.body?.libraryId !== parsed.libraryId || typeof catalogLookup.readRecord !== 'function')
        throw Object.assign(new Error('Book details are unavailable'), { code: 'BOOK_METADATA_UNAVAILABLE' });
      const entry = directory.entry?.(parsed.libraryId);
      if (!entry) return res.status(404).json(publicError('BOOK_NOT_FOUND', 'No public book details were found.'));
      const controller = new AbortController();
      const abandon = () => { if (!res.writableEnded) controller.abort(); };
      res.on('close', abandon);
      try {
        book = await catalogLookup.readRecord({ library: entry, read: () => bookService.resolve(bookKey), signal: controller.signal })
          .catch(error => { if (error?.code === 'CATALOG_UNSUPPORTED') throw Object.assign(new Error('Book details are unavailable'), { code: 'BOOK_METADATA_UNAVAILABLE' }); throw error; });
      } finally { res.off('close', abandon); }
    } else {
      book = await bookService.resolve(bookKey);
    }
    if (!book) return res.status(404).json(publicError('BOOK_NOT_FOUND', 'No public book details were found.'));
    return res.json({ book });
  }));

  router.post('/availability', route(telemetry, 'availability', async (req, res) => {
    const { libraryId, bookKey, editionScope, language } = parseAvailability(req.body);
    if (!bookKey) return res.status(404).json(publicError('BOOK_NOT_FOUND', 'No public book details were found.'));
    // A reader who leaves stops the lookup layer's remaining catalog requests.
    const controller = new AbortController();
    const abandon = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', abandon);
    const startedAt = Date.now();
    const result = await availabilityService.check({ libraryId, bookKey, ...(editionScope ? { editionScope } : {}), ...(language ? { language } : {}), signal: controller.signal })
      .finally(() => res.off('close', abandon));
    if (result.kind === 'result') {
      afterResponse(res, store, () => ({ kind: 'book_check', libraryId, bookKey, outcome: String(result.response?.outcome || 'unknown'),
        source: 'live', durationMs: Date.now() - startedAt }));
    }
    if (result.kind === 'library_not_found') return res.status(404).json(publicError('LIBRARY_NOT_FOUND', 'This library is not in the directory.'));
    if (result.kind === 'book_not_found') return res.status(404).json(publicError('BOOK_NOT_FOUND', 'No public book details were found.'));
    return res.json(result.response);
  }));

  router.post('/holdings/lookup', route(telemetry, 'holdings_lookup', holdings.holdingsLookup));
  router.post('/holdings/check', route(telemetry, 'holdings_check', holdings.holdingsCheck));
  router.post('/holdings/search', route(telemetry, 'holdings_search', holdings.holdingsSearch));
  router.post('/suggestions', route(telemetry, 'suggestions', suggestions.suggest));
  router.post('/suggestions/events', route(telemetry, 'suggestion_event', suggestions.suggestionEvent));
  router.post('/library-requests', route(telemetry, 'library_request', holdings.libraryRequest));
  router.post('/problem-reports', route(telemetry, 'problem_report', holdings.problemReport));

  return router;
}
