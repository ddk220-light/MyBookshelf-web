import { enqueueTask, getJson } from './providers/http.js';

// Open Library reads for shelf suggestions (docs/plans/2026-11-14-desktop-and-
// shelf-suggestions.md, Part 2). Each call is one paced GET, never retried,
// with its own timeout. Callers count every call against the suggestion
// request's outbound cap and cache the answers for 24 hours; nothing here
// caches, and nothing here ever reaches a library catalog.
//
//   workRecord(workId)      /works/<id>.json              title, subjects, places, authors
//   isbnRecord(isbn)        /search.json?isbn=…           the same for the edition's work (places as `place`)
//   authorWorks(authorKey)  /search.json?author_key=…&sort=readinglog   the author's most-read works
//   relatedWorks(query)     /search.json?q=subject:"…" place:"…"&sort=readinglog
//                           (or two specific subjects; never a single subject)
// Related books need a cover, a title in Latin letters, and nothing for
// adults or extremist; see `blockedBook`.

const ORIGIN = 'https://openlibrary.org';
const USER_AGENT = 'MyBookshelf/1.0 (book suggestions; https://mybookshelf.cloud/privacy)';
const WORK_ID = /^OL\d+W$/;
export const OPEN_LIBRARY_TIMEOUT_MS = 8_000;
// Uncached reads from one instance are spaced at least this far apart.
const SPACING_MS = 500;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const AUTHOR_WORKS_LIMIT = 10;
const RELATED_WORKS_LIMIT = 20;
const AUTHOR_KEY = /^OL\d+A$/;

const unavailable = () => Object.assign(new Error('Open Library is unavailable for suggestions'), { code: 'SUGGESTIONS_UPSTREAM' });
const text = (value, maximum = 500) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, maximum) : null);
const names = values => (Array.isArray(values) ? values : []).map(value => text(typeof value === 'string' ? value : value?.name, 240)).filter(Boolean).slice(0, 20);
const coverOf = id => (Number.isInteger(id) && id > 0 ? `https://covers.openlibrary.org/b/id/${id}-M.jpg` : null);
const workIdOf = key => { const id = String(key || '').replace(/^\/works\//, ''); return WORK_ID.test(id) ? id : null; };
// Suggestions stand on everyone's shelf, so books for adults only are never
// suggested: a title or subject naming one of these is skipped.
const ADULT = /\b(sex|sexual\w*|sex instruction|erotic\w*|pornograph\w*|kama ?sutra|bdsm)\b/i;
const forAdults = (title, subjects) => ADULT.test(title) || subjects.some(subject => ADULT.test(subject));
// Nor anything that names extremism in its title or subjects.
const EXTREMIST = /\b(national socialism|nazi\w*|neo-?nazi\w*|anti-?semiti\w*|white supremac\w*)/i;
/** A book never suggested: for adults only, or naming extremism, in its title or subjects. */
export function blockedBook(title, subjects = []) {
  return forAdults(title || '', subjects) || EXTREMIST.test(title || '') || subjects.some(subject => EXTREMIST.test(subject));
}
// Related books come from Open Library's worldwide popularity list, so only
// titles written in Latin letters (accents allowed) are suggested from it.
const LATIN_TITLE = /^[\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]+$/u;

let nextRequestAt = 0;

/** One paced GET to Open Library (JSON), or null for a 404. Rejects on any other failure. */
export function readOpenLibrary(path, { timeoutMs = OPEN_LIBRARY_TIMEOUT_MS } = {}) {
  const deadlineAt = Date.now() + timeoutMs;
  return enqueueTask('openlibrary:suggestions', async () => {
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay) await new Promise(resolve => { setTimeout(resolve, delay); });
    nextRequestAt = Date.now() + SPACING_MS;
    const response = await getJson(`${ORIGIN}${path}`, { deadlineAt, retries: 0, maxResponseBytes: MAX_RESPONSE_BYTES,
      headers: { 'User-Agent': USER_AGENT } });
    if (response.status === 404) return null;
    if (!response.ok || response.unreadable) throw unavailable();
    return response.json;
  }, { deadlineAt });
}

/** A title compared without case, punctuation or extra spaces. */
export const titleKey = value => subjectWords(value);

/** The subjects named on a work or search record, as Open Library writes them. */
export function parseSubjects(values) {
  return (Array.isArray(values) ? values : []).map(value => text(value, 200)).filter(Boolean).slice(0, 100);
}

/** Author keys as a work record (`/authors/OL…A`) or a search doc (`OL…A`) gives them. */
export function parseAuthorKeys(values) {
  return (Array.isArray(values) ? values : []).map(value => String(typeof value === 'string' ? value : value?.author?.key || '').replace(/^\/authors\//, ''))
    .filter(key => AUTHOR_KEY.test(key)).slice(0, 10);
}

/** What related suggestions need from a work: its title, subjects, places and author keys. */
export function parseWorkRecord(record, workId = workIdOf(record?.key)) {
  return { ...(workId ? { workId } : {}), title: text(record?.title) || '', subjects: parseSubjects(record?.subjects ?? record?.subject),
    places: parseSubjects(record?.subject_places ?? record?.place ?? record?.subject_place), authorKeys: parseAuthorKeys(record?.authors ?? record?.author_key) };
}

// Tags and catalogue housekeeping, never a subject to suggest from.
const JUNK_SUBJECTS = new Set(['accessible book', 'protected daisy', 'in library', 'large type books', 'large print books', 'lending library', 'overdrive',
  'open library staff picks', 'popular print disabled books', 'long now manual for civilization', 'internet archive wishlist', 'new york times bestseller',
  'new york times reviewed', 'bestsellers', 'textbooks', 'thesis', 'manuscripts', 'specimens', 'reading', 'books and reading']);
const JUNK_PART = /\b(accessible|daisy|large type|large print|in library|lending library|staff picks|overdrive|internet archive|wishlist|bestsellers?|print disabled|reading level|open library|award)\b/;
// Subjects too broad on their own. With a place they are fine ("Fiction" in "India").
const BROAD_SUBJECTS = new Set(['fiction', 'nonfiction', 'non fiction', 'general', 'literature', 'novel', 'novels', 'stories', 'short stories',
  'fiction general', 'general fiction', 'literary fiction', 'english fiction', 'fiction in english', 'english literature', 'american fiction',
  'juvenile fiction', 'juvenile literature', 'young adult fiction', 'children s fiction', 'history', 'biography', 'autobiography',
  'literature and fiction', 'fiction fiction', 'social life and customs', 'description and travel', 'politics and government', 'civilization']);
const BROAD_WORDS = new Set(['fiction', 'general', 'literature', 'novel', 'novels', 'stories', 'book', 'books', 'english', 'juvenile', 'literary', 'popular', 'and']);
const subjectWords = value => String(value || '').normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** A tag such as "Accessible book", "Protected DAISY", "nyt:…" or a date, never a subject to suggest from. */
export function isJunkSubject(subject) {
  if (typeof subject !== 'string' || /[:=]/.test(subject)) return true;
  const words = subjectWords(subject);
  return words.length < 3 || words.length > 60 || /\d{3,}/.test(words) || JUNK_SUBJECTS.has(words) || JUNK_PART.test(words);
}

/** A real subject, but too broad to suggest from without a place ("Fiction", "Biography"). */
export function isBroadSubject(subject) {
  const words = subjectWords(subject);
  return BROAD_SUBJECTS.has(words) || words.split(' ').every(word => BROAD_WORDS.has(word));
}

const quoted = value => '"' + String(value).replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) + '"';

/**
 * The related-books query for a work, or null. With a place: its first
 * subject that is not a tag, in its first place (`subject:"Biography"
 * place:"India"`). Without one: its first two specific subjects together.
 * Never a single subject on its own: a most-read list for one subject (say
 * "Presidents") is not related to the book.
 */
export function relatedQuery({ subjects = [], places = [] } = {}) {
  const usable = subjects.filter(subject => !isJunkSubject(subject)).slice(0, 30);
  const place = places.find(value => !isJunkSubject(value));
  if (place && usable.length) return `subject:${quoted(usable[0])} place:${quoted(place)}`;
  const specific = [...new Map(usable.filter(subject => !isBroadSubject(subject)).map(subject => [subjectWords(subject), subject])).values()];
  return specific.length >= 2 ? `subject:${quoted(specific[0])} subject:${quoted(specific[1])}` : null;
}

/**
 * Search docs to suggestion books: Open Library works with a title in Latin
 * letters, an author and a cover, nothing for adults or extremist, and only
 * the first of several works with the same title.
 */
export function parseSubjectWorks(data) {
  const books = [];
  const titles = new Set();
  for (const doc of Array.isArray(data?.docs) ? data.docs : []) {
    const workId = workIdOf(doc?.key);
    const title = text(doc?.title);
    const authors = names(doc?.author_name);
    const coverUrl = coverOf(doc?.cover_i);
    if (!workId || !title || !authors.length || !coverUrl) continue;
    if (!LATIN_TITLE.test(title) || blockedBook(title, parseSubjects(doc?.subject))) continue;
    const key = titleKey(title);
    if (titles.has(key)) continue;
    titles.add(key);
    books.push({ bookKey: `v1:openlibrary:${workId}`, workId, title, authors, coverUrl });
  }
  return books;
}

export function createOpenLibrarySuggestionReads({ read = readOpenLibrary } = {}) {
  return Object.freeze({
    async workRecord(workId) {
      if (!WORK_ID.test(workId || '')) return null;
      const work = await read(`/works/${workId}.json`);
      return parseWorkRecord(work || {}, workId);
    },
    async isbnRecord(isbn) {
      // The search index names a work's subject places `place`; `subject_place` is read only when `place` is missing.
      const params = new URLSearchParams({ isbn, fields: 'key,title,subject,place,subject_place,author_key', limit: '1' });
      const doc = (await read(`/search.json?${params}`))?.docs?.[0] || {};
      return parseWorkRecord({ key: doc.key, title: doc.title, subject: doc.subject, place: doc.place ?? doc.subject_place, author_key: doc.author_key });
    },
    async authorWorks(authorKey) {
      if (!AUTHOR_KEY.test(authorKey || '')) return [];
      const params = new URLSearchParams({ author_key: authorKey, sort: 'readinglog', fields: 'key,title,author_name,cover_i,subject', limit: String(AUTHOR_WORKS_LIMIT) });
      return parseSubjectWorks(await read(`/search.json?${params}`));
    },
    async relatedWorks(query) {
      if (typeof query !== 'string' || !/^subject:"/.test(query)) return [];
      const params = new URLSearchParams({ q: query, sort: 'readinglog', fields: 'key,title,author_name,cover_i,subject', limit: String(RELATED_WORKS_LIMIT) });
      return parseSubjectWorks(await read(`/search.json?${params}`));
    },
  });
}
