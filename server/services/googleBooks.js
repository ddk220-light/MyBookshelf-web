import fetch from 'node-fetch';

const GOOGLE_BOOKS_ORIGIN = 'https://www.googleapis.com/books/v1/volumes';
const GOOGLE_TIMEOUT_MS = 8_000;
const MAX_METADATA_BYTES = 2 * 1024 * 1024;

function assertSuccessful(response) {
  if (response.ok) return;
  const error = new Error(`Google Books request failed (${response.status})`);
  error.code = 'BOOK_METADATA_UNAVAILABLE';
  error.upstream = 'google_books';
  error.status = response.status;
  throw error;
}

async function googleJson(url, { allowNotFound = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (allowNotFound && response.status === 404) return null;
    assertSuccessful(response);
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_METADATA_BYTES) {
      const error = new Error('Google Books response was too large');
      error.code = 'BOOK_METADATA_UNAVAILABLE';
      error.upstream = 'google_books';
      throw error;
    }
    return response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeout = new Error('Google Books request timed out');
      timeout.code = 'BOOK_METADATA_UNAVAILABLE';
      timeout.upstream = 'google_books';
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function bookFromVolume(item) {
  const info = item?.volumeInfo || {};
  return {
    title: info.title,
    author: info.authors?.join(', '),
    isbn: info.industryIdentifiers?.find((identifier) => identifier.type === 'ISBN_13')?.identifier ||
          info.industryIdentifiers?.find((identifier) => identifier.type === 'ISBN_10')?.identifier,
    cover_image_url: info.imageLinks?.thumbnail?.replace('http:', 'https:') ||
                     info.imageLinks?.smallThumbnail?.replace('http:', 'https:'),
    description: info.description,
    page_count: info.pageCount,
    publish_year: info.publishedDate ? parseInt(info.publishedDate.slice(0, 4), 10) : null,
    publisher: info.publisher,
    published_date: info.publishedDate,
    categories: info.categories,
    average_rating: info.averageRating,
    ratings_count: info.ratingsCount,
    source_id: item?.id,
  };
}

function withKey(url) {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY || '';
  return apiKey ? `${url}&key=${encodeURIComponent(apiKey)}` : url;
}

export async function searchGoogleBooks({ isbn, title, author }) {
  let query;
  if (isbn) {
    query = `isbn:${isbn}`;
  } else {
    const parts = [];
    if (title) parts.push(`intitle:${title}`);
    if (author) parts.push(`inauthor:${author}`);
    query = parts.join('+');
  }

  const url = withKey(`${GOOGLE_BOOKS_ORIGIN}?q=${encodeURIComponent(query)}&maxResults=1`);
  const data = await googleJson(url);
  const item = data.items?.[0];
  if (!item) return null;
  return bookFromVolume(item);
}

// Multi-result variant for the manual-entry lookup picker.
export async function searchGoogleBooksMulti({ title, author, max = 5 }) {
  const parts = [];
  if (title) parts.push(`intitle:${title}`);
  if (author) parts.push(`inauthor:${author}`);
  const query = parts.join('+');
  if (!query) return [];

  const url = withKey(`${GOOGLE_BOOKS_ORIGIN}?q=${encodeURIComponent(query)}&maxResults=${Math.max(1, Math.min(max, 10))}`);
  const data = await googleJson(url);
  return (data.items || []).map(bookFromVolume);
}

// The public discovery box accepts title words and author names together.
// Relevance is checked against returned titles/authors by workDiscovery.
export async function searchGoogleBooksByQuery({ query, max = 40, offset = 0 }) {
  if (!query?.trim()) return [];
  const url = withKey(`${GOOGLE_BOOKS_ORIGIN}?q=${encodeURIComponent(query)}&maxResults=${Math.max(1, Math.min(max, 40))}&startIndex=${offset}`);
  const data = await googleJson(url);
  return (data.items || []).map(bookFromVolume);
}

export async function getGoogleBookByVolumeId(volumeId) {
  if (typeof volumeId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(volumeId)) return null;
  const url = withKey(`${GOOGLE_BOOKS_ORIGIN}/${encodeURIComponent(volumeId)}?projection=full`);
  const data = await googleJson(url, { allowNotFound: true });
  return data?.volumeInfo?.title ? bookFromVolume(data) : null;
}

export async function searchRelatedBooks(author) {
  try {
    const url = withKey(`${GOOGLE_BOOKS_ORIGIN}?q=inauthor:${encodeURIComponent(author)}&maxResults=4`);
    const data = await googleJson(url);
    return (data.items || []).map(bookFromVolume);
  } catch {
    return [];
  }
}
