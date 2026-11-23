import fetch from 'node-fetch';

const OPEN_LIBRARY_ORIGIN = 'https://openlibrary.org';
const OPEN_LIBRARY_USER_AGENT = 'MyBookshelf/1.0 (web; +https://mybookshelf.cloud/privacy)';

function publishYear(value) {
  const match = String(value || '').match(/\b(1[0-9]{3}|20[0-9]{2}|2100)\b/);
  return match ? Number(match[1]) : null;
}

export function parseOpenLibraryBook(data, isbn) {
  const book = data?.[`ISBN:${isbn}`];
  if (!book?.title) return null;
  return {
    title: book.title,
    author: Array.isArray(book.authors)
      ? book.authors.map((author) => author?.name).filter(Boolean).join(', ') || null
      : null,
    isbn,
    cover_image_url: book.cover?.large || book.cover?.medium || book.cover?.small || null,
    description: typeof book.notes === 'string' ? book.notes : book.notes?.value || null,
    page_count: Number.isFinite(Number(book.number_of_pages)) ? Number(book.number_of_pages) : null,
    publish_year: publishYear(book.publish_date),
  };
}

function workId(value) {
  const match = String(value || '').match(/^\/works\/(OL\d+W)$/);
  return match ? match[1] : null;
}

function openLibraryCover(coverId) {
  const value = Number(coverId);
  return Number.isInteger(value) && value > 0
    ? `https://covers.openlibrary.org/b/id/${value}-L.jpg`
    : null;
}

export function parseOpenLibrarySearchResult(value) {
  const title = typeof value?.title === 'string' ? value.title.trim() : '';
  const sourceId = workId(value?.key);
  if (!title || !sourceId) return null;
  return {
    title,
    author: Array.isArray(value.author_name) ? value.author_name.filter(Boolean).join(', ') || null : null,
    isbn: Array.isArray(value.isbn) ? value.isbn.find((isbn) => /^97[89]\d{10}$/.test(String(isbn))) || null : null,
    cover_image_url: openLibraryCover(value.cover_i),
    publisher: Array.isArray(value.publisher) ? value.publisher.find(Boolean) || null : null,
    published_date: Number.isInteger(value.first_publish_year) ? String(value.first_publish_year) : null,
    page_count: Number.isFinite(Number(value.number_of_pages_median)) ? Number(value.number_of_pages_median) : null,
    categories: Array.isArray(value.subject) ? value.subject.filter(Boolean) : [],
    source: 'openlibrary',
    source_id: sourceId,
  };
}

export async function searchOpenLibraryByIsbn(isbn, { fetchImpl = fetch } = {}) {
  const key = `ISBN:${isbn}`;
  const url = `${OPEN_LIBRARY_ORIGIN}/api/books?bibkeys=${encodeURIComponent(key)}&jscmd=data&format=json`;
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': OPEN_LIBRARY_USER_AGENT },
  });
  if (!response.ok) {
    const error = new Error(`Open Library request failed (${response.status})`);
    error.code = 'BOOK_METADATA_UNAVAILABLE';
    error.upstream = 'open_library';
    error.status = response.status;
    throw error;
  }
  return parseOpenLibraryBook(await response.json(), isbn);
}

export async function searchOpenLibraryByText({ title, author, max = 5 }, { fetchImpl = fetch } = {}) {
  const query = new URLSearchParams({
    limit: String(Math.max(1, Math.min(Number(max) || 5, 10))),
    fields: 'key,title,author_name,isbn,cover_i,publisher,first_publish_year,number_of_pages_median,subject',
  });
  let hasSearchTerm = false;
  if (typeof title === 'string' && title.trim()) {
    query.set('title', title.trim());
    hasSearchTerm = true;
  }
  if (typeof author === 'string' && author.trim()) {
    query.set('author', author.trim());
    hasSearchTerm = true;
  }
  if (!hasSearchTerm) return [];

  const response = await fetchImpl(`${OPEN_LIBRARY_ORIGIN}/search.json?${query.toString()}`, {
    headers: { 'User-Agent': OPEN_LIBRARY_USER_AGENT },
  });
  if (!response.ok) {
    const error = new Error(`Open Library request failed (${response.status})`);
    error.code = 'BOOK_METADATA_UNAVAILABLE';
    error.upstream = 'open_library';
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  return (Array.isArray(data.docs) ? data.docs : []).map(parseOpenLibrarySearchResult).filter(Boolean);
}

export async function getOpenLibraryWorkById(id, { fetchImpl = fetch } = {}) {
  if (!/^OL\d+W$/.test(String(id || ''))) return null;
  const response = await fetchImpl(`${OPEN_LIBRARY_ORIGIN}/works/${encodeURIComponent(id)}.json`, {
    headers: { 'User-Agent': OPEN_LIBRARY_USER_AGENT },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const error = new Error(`Open Library request failed (${response.status})`);
    error.code = 'BOOK_METADATA_UNAVAILABLE';
    error.upstream = 'open_library';
    error.status = response.status;
    throw error;
  }
  const work = await response.json();
  if (typeof work?.title !== 'string' || !work.title.trim()) return null;
  return {
    title: work.title,
    description: typeof work.description === 'string' ? work.description : work.description?.value || null,
    cover_image_url: openLibraryCover(Array.isArray(work.covers) ? work.covers[0] : null),
    published_date: typeof work.first_publish_date === 'string' ? work.first_publish_date : null,
    categories: Array.isArray(work.subjects) ? work.subjects.filter(Boolean) : [],
    source: 'openlibrary',
    source_id: id,
  };
}
