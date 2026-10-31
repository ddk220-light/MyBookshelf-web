import { searchGoogleBooks, searchGoogleBooksMulti } from './googleBooks.js';
import { searchOpenLibraryByIsbn, searchOpenLibraryByText } from './openLibrary.js';

export async function lookupBookMetadata(
  query,
  { googleLookup = searchGoogleBooks, openLibraryLookup = searchOpenLibraryByIsbn } = {},
) {
  const failures = [];
  try {
    const googleBook = await googleLookup(query);
    if (googleBook) return { book: googleBook, source: 'google_books' };
  } catch (error) {
    failures.push(error);
  }

  if (query.isbn) {
    try {
      const openLibraryBook = await openLibraryLookup(query.isbn);
      if (openLibraryBook) return { book: openLibraryBook, source: 'open_library' };
    } catch (error) {
      failures.push(error);
    }
  }

  // A clean response from every attempted source is a real metadata miss. If
  // any source failed, do not mislabel the book as nonexistent.
  if (failures.length) {
    const error = new Error('Book metadata services are temporarily unavailable');
    error.code = 'BOOK_METADATA_UNAVAILABLE';
    error.causes = failures;
    throw error;
  }
  return { book: null, source: null };
}

export async function searchBookMetadataByText(
  query,
  { googleLookup = searchGoogleBooksMulti, openLibraryLookup = searchOpenLibraryByText } = {},
) {
  const failures = [];
  try {
    const googleBooks = await googleLookup(query);
    if (Array.isArray(googleBooks) && googleBooks.length) return googleBooks;
  } catch (error) {
    failures.push(error);
  }

  try {
    const openLibraryBooks = await openLibraryLookup(query);
    if (Array.isArray(openLibraryBooks) && openLibraryBooks.length) return openLibraryBooks;
  } catch (error) {
    failures.push(error);
  }

  if (failures.length) {
    const error = new Error('Book metadata services are temporarily unavailable');
    error.code = 'BOOK_METADATA_UNAVAILABLE';
    error.causes = failures;
    throw error;
  }
  return [];
}
