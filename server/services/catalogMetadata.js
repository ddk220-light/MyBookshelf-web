import { cachedTask, getJson } from './providers/http.js';
import { searchGoogleBooks } from './googleBooks.js';
import { validateAndNormalize } from './isbn.js';
import { text } from './providers/catalogHtml.js';

const description = value => typeof value === 'string' ? value : value?.value;
const cover = value => Number.isInteger(value) && value > 0 ? `https://covers.openlibrary.org/b/id/${value}-M.jpg` : undefined;

async function readOpenLibrary(path, deadlineAt) {
  const response = await getJson(`https://openlibrary.org${path}`, { deadlineAt, retries: 0 });
  if (response.status === 404) return null;
  if (!response.ok || response.unreadable) throw new Error('Book metadata unavailable');
  return response.json;
}

// Enrichment never supplies a catalog identity, work relationship or holdings.
// Only an ISBN supplied by the catalog can qualify another source's metadata.
export function createCatalogMetadata({ read = readOpenLibrary, google = searchGoogleBooks, cache = cachedTask } = {}) {
  async function openLibrary(isbn, deadlineAt) {
    const edition = await read(`/isbn/${isbn}.json`, deadlineAt);
    if (!edition?.title || ![...(edition.isbn_13 || []), ...(edition.isbn_10 || [])].some(value => validateAndNormalize(value) === isbn)) return null;
    let work;
    const workKey = edition.works?.[0]?.key;
    if (/^\/works\/OL\d+W$/.test(workKey || '')) {
      try { work = await read(`${workKey}.json`, deadlineAt); } catch { /* Keep the verified edition's metadata. */ }
    }
    return { coverUrl: cover(edition.covers?.[0]) || cover(work?.covers?.[0]),
      description: description(edition.description) || description(work?.description),
      pageCount: edition.number_of_pages, publisher: edition.publishers?.[0], publishedDate: edition.publish_date,
      subjects: work?.subjects || edition.subjects };
  }

  async function googleBooks(isbn) {
    const book = await google({ isbn });
    if (!book?.title || validateAndNormalize(book.isbn ?? book.isbn13) !== isbn) return null;
    return { coverUrl: book.coverUrl || book.cover_image_url, description: book.description ? text(book.description) : undefined,
      pageCount: book.pageCount || book.page_count, publisher: book.publisher,
      publishedDate: book.published_date, subjects: book.categories };
  }

  return async value => {
    const isbn = validateAndNormalize(value);
    if (!isbn) return {};
    const deadlineAt = Date.now() + 10_000;
    return cache(`catalog-metadata:isbn:${isbn}`, async () => {
      const sources = await Promise.allSettled([openLibrary(isbn, deadlineAt - 1000), googleBooks(isbn)]);
      const supplements = sources.filter(result => result.status === 'fulfilled' && result.value).map(result => result.value);
      if (!supplements.length && sources.some(result => result.status === 'rejected')) throw new Error('Book metadata unavailable');
      const combined = {};
      // Prefer Open Library; Google Books fills gaps in the same ISBN's record.
      for (const supplement of supplements) for (const [key, value] of Object.entries(supplement)) {
        if (value != null && value !== '' && (!Array.isArray(value) || value.length) && combined[key] == null) combined[key] = value;
      }
      return combined;
    }, { deadlineAt, ttlMs: 6 * 60 * 60 * 1000, shouldCache: result => Object.keys(result).length > 0 });
  };
}

export const catalogMetadata = createCatalogMetadata();
