// The server's shelf suggestions (docs/plans/2026-11-14-desktop-and-shelf-
// suggestions.md, Part 2, step B): popular books related to what the reader
// viewed or saved, then the seed list, with those the chosen library is
// known to have first. The request carries book keys and the chosen library
// only: never search text, never in a URL or browser storage, and nothing in
// it is stored by the server.
import { publicApi, type SuggestionRequest } from '../api';
import type { RecentBook } from '../types';
import type { SuggestedBook } from './pickSuggestions';
import type { SuggestionContext, SuggestionSource } from './useShelfSuggestions';

export const RECENT_KEYS = 3;
export const EXCLUDE_KEYS = 200;
/** The server sends up to 15; anything past this is ignored. */
const MAX_BOOKS = 20;
/** A partial answer's books, then the last ones, up to this many. */
const MAX_MERGED = 30;
/** "Shown" is reported for the books drawn for one refresh: at most five. */
export const SHOWN_KEYS = 5;
const WORK_KEY = /^v1:openlibrary:OL\d+W$/;
const ISBN_KEY = /^v1:isbn:(97[89]\d{10})$/;
// Hosts the app's security policy lets a cover load from.
const COVER_HOSTS = new Set(['covers.openlibrary.org', 'books.google.com', 'books.googleusercontent.com']);

/** A valid ISBN-13 (978/979 and its check digit), as the server's validation needs. */
export function validIsbn13(value: string | null | undefined): string | null {
  const digits = typeof value === 'string' ? value.replace(/[\s-]/g, '') : '';
  if (!/^97[89]\d{10}$/.test(digits)) return null;
  const sum = [...digits.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(digits[12]) ? digits : null;
}

/** A key a suggestion can have, and the only kinds the server accepts: an Open Library work or a valid ISBN-13. */
export function isSuggestionKey(key: unknown): key is string {
  if (typeof key !== 'string') return false;
  const isbn = ISBN_KEY.exec(key);
  return WORK_KEY.test(key) || Boolean(isbn && validIsbn13(isbn[1]));
}

/**
 * The keys a server suggestion could have for this book: its own key when it
 * is an Open Library work or an ISBN, the ISBN key of its ISBN-13 and the
 * key of its Open Library work (`workId`, display only). Server suggestions
 * are only ever such keys, so other records are left to the app's own check
 * (pickSuggestions), which stays the authority.
 */
export function serverKeys(book: Pick<RecentBook, 'bookKey' | 'isbn13' | 'workId'>): string[] {
  const keys: string[] = [];
  if (isSuggestionKey(book.bookKey)) keys.push(book.bookKey);
  const isbn = validIsbn13(book.isbn13);
  if (isbn && !keys.includes('v1:isbn:' + isbn)) keys.push('v1:isbn:' + isbn);
  const work = typeof book.workId === 'string' && /^OL\d+W$/.test(book.workId) ? 'v1:openlibrary:' + book.workId : null;
  if (work && !keys.includes(work)) keys.push(work);
  return keys;
}

const newestFirst = (books: readonly RecentBook[]) => books.map((book, index) => ({ book, index, at: Date.parse(book.viewedAt) || 0 }))
  .sort((a, b) => b.at - a.at || a.index - b.index).map(entry => entry.book);

/**
 * The request body: the chosen library, up to three recent books (viewed or
 * saved, newest first) and the saved books, newest first, up to 200 keys.
 */
export function suggestionRequest({ savedBooks, recentBooks = [], libraryId }: SuggestionContext): SuggestionRequest {
  const recentBookKeys: string[] = [];
  for (const book of newestFirst([...recentBooks, ...savedBooks])) {
    if (recentBookKeys.length >= RECENT_KEYS) break;
    const key = serverKeys(book)[0];
    if (key && !recentBookKeys.includes(key)) recentBookKeys.push(key);
  }
  const excludeKeys = [...new Set(newestFirst(savedBooks).flatMap(serverKeys))].slice(0, EXCLUDE_KEYS);
  return { ...(libraryId ? { libraryId } : {}), recentBookKeys, excludeKeys };
}

const text = (value: unknown, maximum: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, maximum) : null);
function coverLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && COVER_HOSTS.has(url.hostname) ? url.toString() : null;
  } catch { return null; }
}

/**
 * The server's books, read defensively: anything without a work or ISBN key
 * and a title is dropped. `inLibrary` becomes `foundIn` for the library that was
 * asked about, so the badge never shows for another library.
 */
export function parseServerSuggestions(values: readonly unknown[], libraryId: string | null): SuggestedBook[] {
  const books: SuggestedBook[] = [];
  for (const value of values.slice(0, MAX_BOOKS)) {
    if (!value || typeof value !== 'object') continue;
    const raw = value as Record<string, unknown>;
    const bookKey = isSuggestionKey(raw.bookKey) ? raw.bookKey : null;
    const title = text(raw.title, 500);
    if (!bookKey || !title) continue;
    const authors = (Array.isArray(raw.authors) ? raw.authors : []).map(name => text(name, 240)).filter((name): name is string => Boolean(name)).slice(0, 20);
    const coverUrl = coverLink(raw.coverUrl);
    const isbn13 = validIsbn13(typeof raw.isbn13 === 'string' ? raw.isbn13 : null);
    const workId = typeof raw.workId === 'string' && /^OL\d+W$/.test(raw.workId) ? raw.workId : null;
    books.push({ bookKey, title, authors, ...(coverUrl ? { coverUrl } : {}), ...(isbn13 ? { isbn13 } : {}), ...(workId ? { workId } : {}),
      ...(raw.inLibrary === true && libraryId ? { foundIn: libraryId } : {}) });
  }
  return books;
}

/**
 * Whether the server could add anything: it suggests from the chosen library
 * and the recent books only, so with neither it is not asked.
 */
export function serverHasSomethingToAdd(context: SuggestionContext): boolean {
  return Boolean(context.libraryId) || suggestionRequest(context).recentBookKeys.length > 0;
}

/**
 * The server source, ahead of the bundled seed list (useShelfSuggestions).
 * The server always answers 200. An answer it marks `partial` (its store or
 * Open Library failed) does not replace the last books: its books come
 * first, then the last ones, and the pick chooses five.
 */
export const serverSuggestions: SuggestionSource = {
  id: 'server',
  wanted: serverHasSomethingToAdd,
  async load(context, signal, previous = []) {
    const answer = await publicApi.suggestions(suggestionRequest(context), signal);
    const books = parseServerSuggestions(answer.books, context.libraryId);
    if (!answer.partial) return books;
    const fresh = new Set(books.map(book => book.bookKey));
    return [...books, ...previous.filter(book => !fresh.has(book.bookKey))].slice(0, MAX_MERGED);
  },
};

/** Counts a suggested book opened or saved (the anonymous log); a failure changes nothing. */
export function reportSuggestion(event: 'opened' | 'saved', bookKey: string): void {
  if (!isSuggestionKey(bookKey)) return;
  void publicApi.suggestionEvent({ event, bookKey }).catch(() => { /* Counts only: never retried. */ });
}

/** Counts the suggestions drawn for one refresh, at most five, each once; a failure changes nothing. */
export function reportShown(bookKeys: readonly string[]): void {
  const shown = [...new Set(bookKeys.filter(isSuggestionKey))].slice(0, SHOWN_KEYS);
  if (!shown.length) return;
  void publicApi.suggestionEvent({ event: 'shown', bookKeys: shown }).catch(() => { /* Counts only: never retried. */ });
}
