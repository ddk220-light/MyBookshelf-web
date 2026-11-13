import { getGoogleBookByVolumeId } from '../services/googleBooks.js';
import { workDiscovery } from '../services/workDiscovery.js';
import { validateAndNormalize } from '../services/isbn.js';
import { createPublicBookKey, createCatalogBookKey, parsePublicBookKey } from './contracts.js';
import { getProvider } from '../services/providers/index.js';
import { getLibraryById } from '../services/directory.js';
import { catalogHandoffFor } from './catalog-handoff.js';
import { catalogMetadata } from '../services/catalogMetadata.js';
import { decodeHTML } from 'entities';

const MAX_DESCRIPTION_LENGTH = 8_000;
const COVER_HOSTS = new Set([
  'books.google.com',
  'books.googleusercontent.com',
  'covers.openlibrary.org',
]);
const CREDENTIAL_QUERY_KEY = /(key|token|signature|credential|auth|password|secret)/i;

function boundedString(value, maximum = 500) {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result ? result.slice(0, maximum) : null;
}

// Descriptions come from several providers and some send HTML (Google Books
// uses <p>, <b>, <br> and entities such as &quot;). The app shows plain text,
// so markup is removed and entities are decoded once, here. Only real tags are
// removed: a literal "a < b" in the text is kept.
export function plainDescription(value) {
  if (typeof value !== 'string') return null;
  if (!/[<&]/.test(value)) return value;
  const text = value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\s*(?:br\s*\/?|\/p|\/div|\/li|\/h[1-6])\s*>/gi, '\n')
    .replace(/<\/?[a-zA-Z][^<>]*>/g, '');
  return decodeHTML(text).replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n\s*/g, '\n').trim();
}

function authors(value) {
  const items = Array.isArray(value) ? value : String(value || '').split(',');
  return items.map((author) => boundedString(author, 240)).filter(Boolean).slice(0, 20);
}

export function sanitizePublicCoverUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:' || !COVER_HOSTS.has(url.hostname)) return null;
    for (const key of [...url.searchParams.keys()]) {
      if (CREDENTIAL_QUERY_KEY.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function publicRating(raw) {
  const average = Number(raw.average_rating ?? raw.averageRating);
  const count = Number(raw.ratings_count ?? raw.ratingsCount);
  if (!Number.isFinite(average) || average < 0 || average > 5 || !Number.isFinite(count) || count < 0) return null;
  return { average, count: Math.floor(count) };
}

export function toPublicBook(raw, { keyOverride = null } = {}) {
  const title = boundedString(raw?.title);
  if (!title) return null;
  const isbn13 = validateAndNormalize(raw.isbn ?? raw.isbn13);
  const sourceRecordId = boundedString(raw.sourceId ?? raw.source_id, 128);
  let bookKey = keyOverride;
  if (!bookKey) {
    try {
      bookKey = createPublicBookKey({
        isbn: isbn13,
        source: raw?.source === 'openlibrary' ? 'openlibrary' : 'googlebooks',
        sourceRecordId,
      });
    } catch {
      return null;
    }
  }
  const book = {
    bookKey,
    title,
    authors: authors(raw.authors ?? raw.author),
  };
  if (isbn13) book.isbn13 = isbn13;
  if (/^OL\d+W$/.test(raw.workId || '')) book.workId = raw.workId;
  if (raw.searchMatch === 'spelling') book.searchMatch = 'spelling';
  if (Number.isInteger(raw.editionCount) && raw.editionCount > 0) book.editionCount = raw.editionCount;
  if (/^[a-z]{3}$/.test(raw.language || '')) book.language = raw.language;
  if (Array.isArray(raw.languages)) book.languages = [...new Set(raw.languages.filter(value => /^[a-z]{3}$/.test(value)))].slice(0, 100);
  const format = boundedString(raw.physical_format ?? raw.format, 100);
  if (format) book.format = format;
  const coverUrl = sanitizePublicCoverUrl(raw.coverUrl ?? raw.cover_image_url);
  if (coverUrl) book.coverUrl = coverUrl;
  else if (isbn13 && bookKey.startsWith('v1:catalog:')) book.coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn13}-M.jpg?default=false`;
  const description = boundedString(plainDescription(raw.description), MAX_DESCRIPTION_LENGTH);
  if (description) book.description = description;
  const publisher = boundedString(raw.publisher);
  if (publisher) book.publisher = publisher;
  const publishedDate = boundedString(raw.publishedDate ?? raw.published_date ?? raw.publish_year, 32);
  if (publishedDate) book.publishedDate = publishedDate;
  const edition = boundedString(raw.edition);
  if (edition) book.edition = edition;
  const pageCount = Number(raw.pageCount ?? raw.page_count);
  if (Number.isInteger(pageCount) && pageCount > 0 && pageCount <= 100_000) book.pageCount = pageCount;
  const subjects = (Array.isArray(raw.subjects) ? raw.subjects : raw.categories || [])
    .map((subject) => boundedString(subject, 240)).filter(Boolean).slice(0, 30);
  if (subjects.length) book.subjects = subjects;
  const rating = publicRating(raw);
  if (rating) book.rating = rating;
  return book;
}

function isMetadataUnavailable(error) {
  return error?.code === 'BOOK_METADATA_UNAVAILABLE';
}

export function createPublicBookService({
  lookupByIsbn = workDiscovery.lookup,
  searchByText = workDiscovery.searchPage,
  resolveGoogleVolume = getGoogleBookByVolumeId,
  resolveOpenLibraryWork = workDiscovery.resolve,
  expandWork = workDiscovery.profile,
  now = () => Date.now(),
  cacheTtlMs = 10 * 60 * 1000,
  catalogs = null,
  findLibrary = getLibraryById,
  providerFor = getProvider,
  enrichCatalogIsbn = catalogMetadata,
} = {}) {
  const cache = new Map();

  function remember(book, ttlMs = cacheTtlMs, detailsResolved = true) {
    if (cache.size >= 512) cache.delete(cache.keys().next().value);
    cache.set(book.bookKey, { book, detailsResolved, expiresAt: now() + ttlMs });
    return book;
  }

  function cached(bookKey, requireDetails = false) {
    const value = cache.get(bookKey);
    if (!value) return null;
    if (value.expiresAt <= now()) {
      cache.delete(bookKey);
      return null;
    }
    return requireDetails && !value.detailsResolved ? null : value.book;
  }

  async function resolveIsbn(isbn13) {
    const bookKey = createPublicBookKey({ isbn: isbn13 });
    const hit = cached(bookKey);
    if (hit) return hit;
    const placeholder = (metadataStatus) => ({ bookKey, isbn13, title: `ISBN ${isbn13}`, authors: [], metadataStatus });
    let result;
    try {
      result = await lookupByIsbn({ isbn: isbn13 });
    } catch (error) {
      if (!isMetadataUnavailable(error)) throw error;
      // Public metadata is optional for an exact ISBN catalog lookup. Keep the
      // outage explicit and retry enrichment sooner than a normal cache entry.
      return remember(placeholder('unavailable'), Math.min(cacheTtlMs, 60_000));
    }
    const book = result?.book ? toPublicBook(result.book) : null;
    // A metadata source can return a nearby edition. Do not silently change
    // the user's ISBN or attach another edition's title to this lookup.
    return remember(book?.isbn13 === isbn13 ? book : placeholder('missing'));
  }

  const service = {
    async search({ query, isbnLike, isbn13, libraryId, offset = 0 }) {
      if (isbnLike && !isbn13) return { kind: 'invalid' };
      if (isbn13) {
        return { kind: 'exact', book: await resolveIsbn(isbn13) };
      }
      if (libraryId && catalogs) {
        const result = await catalogs.search(libraryId, query, { offset });
        return { ...result, candidates: result.candidates.map(raw => toPublicBook(raw, { keyOverride: raw.bookKey })).filter(Boolean)
          .map(book => remember(book, cacheTtlMs, false)) };
      }
      const library = libraryId ? findLibrary(libraryId) : null;
      const provider = library && providerFor(library);
      let catalogUnavailable = false;
      if (provider?.searchCatalog) {
        try {
          const records = await provider.searchCatalog(query);
          return { kind: 'candidates', source: 'catalog', candidates: records.map(record => toPublicBook(record,
            { keyOverride: createCatalogBookKey(libraryId, record.recordId) })).filter(Boolean) };
        } catch { catalogUnavailable = true; }
      }
      const handoff = library && catalogHandoffFor({ entry: library, book: { title: query } });
      let candidates;
      try { candidates = await searchByText({ title: query, author: '', max: 160, offset }); }
      catch (error) {
        // The library's own search remains usable during metadata outages.
        if (!isMetadataUnavailable(error) || !handoff?.catalogUrl) throw error;
        candidates = [];
        catalogUnavailable = true;
      }
      return {
        kind: 'candidates',
        ...(catalogUnavailable ? { catalogUnavailable: true } : {}),
        ...(handoff?.catalogUrl ? { catalogSearchUrl: handoff.catalogUrl } : {}),
        ...(!Array.isArray(candidates) ? { nextOffset: candidates?.nextOffset ?? null, ...(candidates?.partial ? { partial: true } : {}) } : {}),
        candidates: (Array.isArray(candidates) ? candidates : candidates?.books || [])
          .map((candidate) => toPublicBook(candidate))
          .filter(Boolean)
          .map(book => remember(book, cacheTtlMs, false)),
      };
    },

    async resolve(bookKey) {
      const parsed = parsePublicBookKey(bookKey);
      if (!parsed) return null;
      if (parsed.kind === 'catalog' && catalogs) {
        if (!catalogs.supports(parsed.libraryId)) return null;
        const hit = cached(bookKey, true);
        if (hit) return hit;
        const raw = await catalogs.resolve(parsed);
        const book = raw ? toPublicBook(raw, { keyOverride: bookKey }) : null;
        return book ? remember(book) : null;
      }
      const hit = cached(bookKey, true);
      if (hit) return hit;
      let raw;
      if (parsed.kind === 'catalog') {
        const library = findLibrary(parsed.libraryId);
        const provider = library && providerFor(library);
        raw = await provider?.resolveCatalogRecord?.(parsed.recordId);
      } else if (parsed.kind === 'isbn') {
        return resolveIsbn(parsed.isbn13);
      } else if (parsed.source === 'googlebooks') {
        raw = await resolveGoogleVolume(parsed.sourceRecordId);
      } else if (parsed.source === 'openlibrary') {
        raw = await resolveOpenLibraryWork(parsed.sourceRecordId);
      } else {
        return null;
      }
      const book = raw ? toPublicBook(raw, { keyOverride: bookKey }) : null;
      return book ? remember(book) : null;
    },

    isMetadataUnavailable,
    async enrich(bookKey) {
      if (parsePublicBookKey(bookKey)?.kind !== 'catalog') return null;
      const book = cached(bookKey) || await service.resolve(bookKey);
      if (!book?.isbn13) return book;
      try {
        const extra = await enrichCatalogIsbn(book.isbn13);
        // Catalog title, authors, ISBN, publisher/date and record key always win.
        const merged = { ...book };
        for (const field of ['description', 'pageCount', 'subjects', 'publisher', 'publishedDate']) {
          if (merged[field] == null && extra[field] != null) merged[field] = extra[field];
        }
        if (sanitizePublicCoverUrl(extra.coverUrl)) merged.coverUrl = extra.coverUrl;
        return remember(toPublicBook(merged, { keyOverride: bookKey }), cacheTtlMs, cache.get(bookKey)?.detailsResolved ?? true);
      } catch { return book; } // Optional metadata cannot hide a catalog result.
    },
    // Identity for matching: a book this service already returned (a search
    // result, whose title, authors and work ID come with its key) is used as
    // it is; anything else is resolved. Result marking needs nothing more, and
    // resolving nine works in full first costs about two paced Open Library
    // reads each before any edition list can be read.
    async summary(bookKey) {
      if (parsePublicBookKey(bookKey)?.kind === 'catalog') return service.resolve(bookKey);
      return cached(bookKey) || service.resolve(bookKey);
    },
    async searchProfile(bookKey, options) {
      const book = await service.summary(bookKey);
      return book ? expandWork(book, options) : null;
    },
  };
  return Object.freeze(service);
}
