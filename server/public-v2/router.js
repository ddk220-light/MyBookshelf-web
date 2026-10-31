import { Router } from 'express';
import { createPublicAvailabilityService } from './availability.js';
import { publicError } from './contracts.js';
import { createPublicDirectoryService } from './directory.js';
import { createPublicBookService } from './metadata.js';
import { createPublicCatalogBookService } from './catalogBooks.js';
import { createDiscoveryService } from './discovery.js';
import { createPlaceSearch } from './places.js';
import { createRedactedTelemetrySink } from './telemetry.js';
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

export function createPublicV2Router({
  directory = createPublicDirectoryService(),
  discovery = createDiscoveryService(),
  places = createPlaceSearch(),
  books = null,
  availability = null,
  rateLimit = {},
  telemetry = createRedactedTelemetrySink(),
} = {}) {
  const router = Router();
  const bookService = books || createPublicBookService({ catalogs: createPublicCatalogBookService({ directory }) });
  const availabilityService = availability || createPublicAvailabilityService({ directory, books: bookService });

  router.use((req, res, next) => {
    // This boundary neither reads nor creates identity state. These headers also
    // prevent a public lookup response being stored as a personal browser cache.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  router.use(createIpRateLimiter(rateLimit));

  router.post('/places/search', route(telemetry, 'place_search', async (req, res) => {
    res.json({ places: await places(parsePlaceSearch(req.body)) });
  }));

  router.post('/libraries/discover', route(telemetry, 'directory_search', async (req, res) => {
    res.json(discovery.search(parseDiscovery(req.body)));
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
    const parsed = parseBookSearch(req.body);
    if (parsed.libraryId && !directory.resolve(parsed.libraryId)) return res.status(404).json(publicError('LIBRARY_NOT_FOUND', 'This library is not in the directory.'));
    const result = await bookService.search(parsed);
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
    const { bookKey } = parseBookResolve(req.body);
    if (!bookKey) return res.status(404).json(publicError('BOOK_NOT_FOUND', 'No public book details were found.'));
    const book = await bookService.resolve(bookKey);
    if (!book) return res.status(404).json(publicError('BOOK_NOT_FOUND', 'No public book details were found.'));
    return res.json({ book });
  }));

  router.post('/availability', route(telemetry, 'availability', async (req, res) => {
    const { libraryId, bookKey, editionScope, language } = parseAvailability(req.body);
    if (!bookKey) return res.status(404).json(publicError('BOOK_NOT_FOUND', 'No public book details were found.'));
    const result = await availabilityService.check({ libraryId, bookKey, ...(editionScope ? { editionScope } : {}), ...(language ? { language } : {}) });
    if (result.kind === 'library_not_found') return res.status(404).json(publicError('LIBRARY_NOT_FOUND', 'This library is not in the directory.'));
    if (result.kind === 'book_not_found') return res.status(404).json(publicError('BOOK_NOT_FOUND', 'No public book details were found.'));
    return res.json(result.response);
  }));

  return router;
}
