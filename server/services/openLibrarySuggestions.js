import { enqueueTask, getJson } from './providers/http.js';
import { validateAndNormalize } from './isbn.js';

// Open Library reads for shelf suggestions (docs/plans/2026-11-14-desktop-and-
// shelf-suggestions.md, Part 2). Each call is one paced GET, never retried,
// with its own timeout. Callers count every call against the suggestion
// request's outbound cap and cache the answers for 24 hours; nothing here
// caches, and nothing here ever reaches a library catalog.
//
//   editionsByIsbn(isbns)  /api/books?bibkeys=ISBN:…  one request for many editions
//   workSubjects(workId)   /works/<id>.json             the work's subjects
//   isbnSubjects(isbn)     /search.json?isbn=…          the edition's work and its subjects
//   subjectWorks(subject)  /search.json?subject=…&sort=readinglog   popular works with a cover

const ORIGIN = 'https://openlibrary.org';
const USER_AGENT = 'MyBookshelf/1.0 (book suggestions; https://mybookshelf.cloud/privacy)';
const WORK_ID = /^OL\d+W$/;
export const OPEN_LIBRARY_TIMEOUT_MS = 8_000;
// Uncached reads from one instance are spaced at least this far apart.
const SPACING_MS = 500;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const SUBJECT_WORKS_LIMIT = 40;

const unavailable = () => Object.assign(new Error('Open Library is unavailable for suggestions'), { code: 'SUGGESTIONS_UPSTREAM' });
const text = (value, maximum = 500) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, maximum) : null);
const names = values => (Array.isArray(values) ? values : []).map(value => text(typeof value === 'string' ? value : value?.name, 240)).filter(Boolean).slice(0, 20);
const coverOf = id => (Number.isInteger(id) && id > 0 ? `https://covers.openlibrary.org/b/id/${id}-M.jpg` : null);
const workIdOf = key => { const id = String(key || '').replace(/^\/works\//, ''); return WORK_ID.test(id) ? id : null; };
// Suggestions stand on everyone's shelf, so books for adults only are never
// suggested: a title or subject naming one of these is skipped.
const ADULT = /\b(sex|sexual\w*|sex instruction|erotic\w*|pornograph\w*|kama ?sutra|bdsm)\b/i;
const forAdults = (title, subjects) => ADULT.test(title) || subjects.some(subject => ADULT.test(subject));
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

// A cover from the Books API (an edition's own cover), on the covers host only.
function bookCover(cover) {
  for (const value of [cover?.medium, cover?.large, cover?.small]) {
    if (typeof value !== 'string') continue;
    try {
      const url = new URL(value.replace(/^http:\/\//, 'https://'));
      if (url.protocol === 'https:' && url.hostname === 'covers.openlibrary.org') return url.toString();
    } catch { /* Not a cover link. */ }
  }
  return null;
}

/** Books API answer: ISBN-13 -> { title, authors, coverUrl? } or null (no record), for every ISBN asked. */
export function parseEditions(data, isbns) {
  const result = new Map();
  for (const isbn of isbns) {
    const record = data?.[`ISBN:${isbn}`];
    const title = text(record?.title);
    const authors = names(record?.authors);
    const coverUrl = bookCover(record?.cover);
    const adult = title && forAdults(title, names(record?.subjects));
    result.set(isbn, title && !adult ? { title, authors, ...(coverUrl ? { coverUrl } : {}) } : null);
  }
  return result;
}

/** The subjects named on a work or search record, as Open Library writes them. */
export function parseSubjects(values) {
  return (Array.isArray(values) ? values : []).map(value => text(value, 200)).filter(Boolean).slice(0, 100);
}

/**
 * Search docs to suggestion books: Open Library works with a title in Latin
 * letters, an author and a cover, and nothing for adults only.
 */
export function parseSubjectWorks(data) {
  const books = [];
  for (const doc of Array.isArray(data?.docs) ? data.docs : []) {
    const workId = workIdOf(doc?.key);
    const title = text(doc?.title);
    const authors = names(doc?.author_name);
    const coverUrl = coverOf(doc?.cover_i);
    if (!workId || !title || !authors.length || !coverUrl) continue;
    if (!LATIN_TITLE.test(title) || forAdults(title, parseSubjects(doc?.subject))) continue;
    books.push({ bookKey: `v1:openlibrary:${workId}`, workId, title, authors, coverUrl });
  }
  return books;
}

export function createOpenLibrarySuggestionReads({ read = readOpenLibrary } = {}) {
  return Object.freeze({
    async editionsByIsbn(isbns) {
      const asked = [...new Set(isbns.map(value => validateAndNormalize(value)).filter(Boolean))].slice(0, 50);
      if (!asked.length) return new Map();
      const params = new URLSearchParams({ bibkeys: asked.map(isbn => `ISBN:${isbn}`).join(','), jscmd: 'data', format: 'json' });
      return parseEditions(await read(`/api/books?${params}`), asked);
    },
    async workSubjects(workId) {
      if (!WORK_ID.test(workId || '')) return null;
      const work = await read(`/works/${workId}.json`);
      return work ? { workId, subjects: parseSubjects(work.subjects) } : { workId, subjects: [] };
    },
    async isbnSubjects(isbn) {
      const params = new URLSearchParams({ isbn, fields: 'key,subject', limit: '1' });
      const doc = (await read(`/search.json?${params}`))?.docs?.[0];
      const workId = workIdOf(doc?.key);
      return { ...(workId ? { workId } : {}), subjects: parseSubjects(doc?.subject) };
    },
    async subjectWorks(subject) {
      const params = new URLSearchParams({ subject, sort: 'readinglog', fields: 'key,title,author_name,cover_i,subject', limit: String(SUBJECT_WORKS_LIMIT) });
      return parseSubjectWorks(await read(`/search.json?${params}`));
    },
  });
}
