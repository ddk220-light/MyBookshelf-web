// The server's shelf suggestions (docs/plans/2026-11-14-desktop-and-shelf-
// suggestions.md, Part 2): popular books related to what the reader viewed or
// saved, then the seed list, with those the chosen library is known to have
// first.
//
// Each refresh asks, for up to three recent books, that one book's related
// list (GET /suggestions/related?book=<key>): a public answer, the same for
// every reader, that the browser and Vercel's CDN keep for a day, so a
// repeat costs no function run. The address holds a public book key only:
// never search text, the library or anything else about the reader. With a
// library chosen, the stored answers for the candidates are then asked once
// (POST /holdings/lookup: stored answers only, never a live catalog check).
// Nothing is kept in browser storage.
import { HOLDINGS_LOOKUP_LIMIT, publicApi } from '../api';
import type { RecentBook } from '../types';
import { suggestionCandidates, type SuggestedBook } from './pickSuggestions';
import { SEED_SUGGESTIONS } from './seed';
import type { SuggestionContext, SuggestionSource } from './useShelfSuggestions';

/** Recent books whose related lists are asked for, newest first. */
export const RECENT_KEYS = 3;
/** The server sends up to 30 books a list; anything past this is ignored. */
const MAX_BOOKS = 40;
/** At most this many candidates are asked about at once: the stored-answers lookup's limit. */
export const CANDIDATE_LIMIT = HOLDINGS_LOOKUP_LIMIT;
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
 * The keys a related list can be asked for by, for this book: its own key
 * when it is an Open Library work or an ISBN, the ISBN key of its ISBN-13
 * and the key of its Open Library work (`workId`, display only).
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

/** Up to three recent books (viewed or saved, newest first), each by the first key the server can read it by. */
export function recentBookKeys({ savedBooks, recentBooks = [] }: SuggestionContext): string[] {
  const keys: string[] = [];
  for (const book of newestFirst([...recentBooks, ...savedBooks])) {
    if (keys.length >= RECENT_KEYS) break;
    const key = serverKeys(book)[0];
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

const text = (value: unknown, maximum: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, maximum) : null);
function coverLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && COVER_HOSTS.has(url.hostname) ? url.toString() : null;
  } catch { return null; }
}

/** A related list, read defensively: anything without a work or ISBN key and a title is dropped. */
export function parseServerSuggestions(values: readonly unknown[]): SuggestedBook[] {
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
    books.push({ bookKey, title, authors, ...(coverUrl ? { coverUrl } : {}), ...(isbn13 ? { isbn13 } : {}), ...(workId ? { workId } : {}) });
  }
  return books;
}

/**
 * The candidates, in order: the related lists in recency order (the newest
 * book's first), then the seed list (the one for the chosen library's
 * country; today's list by default); never a saved book or another edition
 * of one, never one twice, at most CANDIDATE_LIMIT. One book per author is
 * left to the final pick.
 */
export function mergeCandidates(lists: ReadonlyArray<readonly SuggestedBook[]>, savedBooks: readonly RecentBook[], seed: readonly SuggestedBook[] = SEED_SUGGESTIONS): SuggestedBook[] {
  return suggestionCandidates([...lists, seed], savedBooks, CANDIDATE_LIMIT);
}

/** Those the library is known to have ("found" stored answers) first, badged for it; the rest keep their order. */
export function liftFound(candidates: readonly SuggestedBook[], found: ReadonlySet<string>, libraryId: string): SuggestedBook[] {
  return [...candidates.filter(book => found.has(book.bookKey)).map(book => ({ ...book, foundIn: libraryId })),
    ...candidates.filter(book => !found.has(book.bookKey))];
}

/**
 * Whether the server could add anything: related books for a recent book,
 * or stored answers for the chosen library. With neither it is not asked.
 */
export function serverHasSomethingToAdd(context: SuggestionContext): boolean {
  return Boolean(context.libraryId) || recentBookKeys(context).length > 0;
}

const aborted = () => new DOMException('The refresh was replaced.', 'AbortError');

/**
 * The server source, ahead of the bundled seed list (useShelfSuggestions).
 * One GET per recent book (at most three) and, with a library chosen, one
 * stored-answers lookup for the candidates. If every related list fails,
 * it rejects and the hook keeps the last books. If some fail or come back
 * partial, the fresh books come first, then the last ones, and the pick
 * chooses five. A failed lookup is no badge, never "not found".
 */
export const serverSuggestions: SuggestionSource = {
  id: 'server',
  wanted: serverHasSomethingToAdd,
  async load(context, signal, previous = []) {
    const keys = recentBookKeys(context);
    const answers = await Promise.allSettled(keys.map(key => publicApi.relatedSuggestions(key, signal)));
    if (signal.aborted) throw aborted();
    const failed = answers.filter(answer => answer.status === 'rejected').length;
    if (keys.length && failed === keys.length) throw new Error('No related list could be read.');
    const partial = failed > 0 || answers.some(answer => answer.status === 'fulfilled' && answer.value.partial);
    const lists = answers.map(answer => (answer.status === 'fulfilled' ? parseServerSuggestions(answer.value.books) : []));
    const seed = context.seed || SEED_SUGGESTIONS;
    const candidates = mergeCandidates(lists, context.savedBooks, seed);
    let books = candidates;
    const libraryId = context.libraryId;
    if (libraryId && candidates.length) {
      try {
        const stored = await publicApi.holdingsLookup(libraryId, candidates.map(book => ({ bookKey: book.bookKey, ...(validIsbn13(book.isbn13) ? { isbn13: book.isbn13 } : {}) })), signal);
        const asked = new Set(candidates.map(book => book.bookKey));
        books = liftFound(candidates, new Set(Object.entries(stored).filter(([bookKey, answer]) => answer === 'found' && asked.has(bookKey)).map(([bookKey]) => bookKey)), libraryId);
      } catch (error) {
        if (signal.aborted) throw error;
        // No answer: no badge.
      }
    }
    if (!partial) return books;
    // Cut short: the fresh related books and those the library has, then the
    // last ones; the seed list follows in the pick.
    const seedKeys = new Set(seed.map(book => book.bookKey));
    const fresh = books.filter(book => book.foundIn || !seedKeys.has(book.bookKey));
    const kept = new Set(fresh.map(book => book.bookKey));
    return [...fresh, ...previous.filter(book => !kept.has(book.bookKey))].slice(0, CANDIDATE_LIMIT);
  },
};

/** Counts a suggested book opened or saved (the anonymous log); a failure changes nothing. */
export function reportSuggestion(event: 'opened' | 'saved', bookKey: string): void {
  if (!isSuggestionKey(bookKey)) return;
  void publicApi.suggestionEvent({ event, bookKey }).catch(() => { /* Counts only: never retried. */ });
}
