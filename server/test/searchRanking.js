// Shared helpers for the search-ranking evaluation. The golden list and the
// captured Open Library responses live in test/fixtures/search-ranking/. The
// offline test replays them through the real discovery and public search code;
// tools/search-ranking/capture.mjs refreshes them.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/search-ranking/', import.meta.url));
export const RESPONSE_DIR = path.join(FIXTURE_DIR, 'responses');

export function loadGolden() {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'golden-queries.json'), 'utf8')).queries;
}

// Requests are keyed without `fields`, `limit` and `offset` order noise: the
// field list can grow without invalidating fixtures captured earlier.
export function requestKey(requestPath) {
  const url = new URL(requestPath, 'https://openlibrary.org');
  const params = [...url.searchParams].filter(([name]) => name !== 'fields')
    .sort(([a], [b]) => a.localeCompare(b));
  return `${url.pathname}?${new URLSearchParams(params)}`;
}

const LIST_LIMIT = 6;
const words = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) || [];

// Long name and alias lists (anthologies list 100 authors; famous authors
// have dozens of spellings) are cut to their first entries, plus later entries
// that share a word (or a 3-letter typo prefix) with the query and either add
// such a related word not kept yet or contain every query word. That keeps every word the
// relevance filter can use while keeping the fixtures small.
function trimList(values, queryWords, limit = LIST_LIMIT) {
  if (!Array.isArray(values) || values.length <= limit) return values;
  const related = word => queryWords.some(query => word === query
    || (query.length >= 4 && word.length >= 3 && word.slice(0, 3) === query.slice(0, 3)));
  const kept = new Set(values.slice(0, limit).flatMap(words));
  let complete = 0;
  return values.filter((value, index) => {
    if (index < limit) return true;
    const own = words(value);
    if (!own.some(related)) return false;
    const whole = queryWords.length > 0 && queryWords.every(query => own.includes(query)) && complete++ < 2;
    if (!whole && own.filter(related).every(word => kept.has(word))) return false;
    own.forEach(word => kept.add(word));
    return true;
  });
}

// Aliases unrelated to the query cannot satisfy the relevance filter, so only
// one is kept. author_key is requested but not read by the search code.
const ALIAS_FIELDS = new Set(['alternative_title', 'author_alternative_name']);
const UNUSED_FIELDS = new Set(['author_key']);

function pick(doc, fields, queryWords) {
  const result = {};
  for (const field of fields) {
    if (field === 'editions' || field.startsWith('editions.') || UNUSED_FIELDS.has(field)) continue;
    if (doc[field] !== undefined) result[field] = trimList(doc[field], queryWords, ALIAS_FIELDS.has(field) ? 1 : LIST_LIMIT);
  }
  if (fields.includes('editions') && Array.isArray(doc.editions?.docs)) {
    result.editions = { docs: doc.editions.docs.map(edition => ({ title: edition.title })).filter(edition => edition.title).slice(0, LIST_LIMIT) };
  }
  return result;
}

// Keep only what the discovery code requests, so fixtures stay small and do
// not retain unrelated upstream data.
export function trimResponse(requestPath, json, query = '') {
  const queryWords = words(query);
  if (!json || typeof json !== 'object') return json;
  const url = new URL(requestPath, 'https://openlibrary.org');
  if (url.pathname === '/search.json') {
    const fields = (url.searchParams.get('fields') || '').split(',').filter(Boolean);
    return { numFound: json.numFound ?? json.num_found, docs: (json.docs || []).slice(0, 40).map(doc => pick(doc, fields, queryWords)) };
  }
  if (/^\/works\/OL\d+W\/editions\.json$/.test(url.pathname)) {
    return { size: json.size, entries: (json.entries || []).map(edition => ({ title: edition.title })).filter(edition => edition.title) };
  }
  return json;
}

// A work usually appears in several of one query's requests. Fixture files
// store each work's fields once and reference it by key from each request.
export function packRequests(requests) {
  const works = {}, packed = {};
  for (const [key, value] of Object.entries(requests)) {
    if (!Array.isArray(value?.docs)) { packed[key] = value; continue; }
    packed[key] = { ...value, docs: value.docs.map(doc => {
      if (!doc.key) return doc;
      const { editions, ...fields } = doc;
      works[doc.key] = { ...works[doc.key], ...fields };
      return editions ? { ref: doc.key, editions } : doc.key;
    }) };
  }
  return { works, requests: packed };
}

export function unpackRequests({ works = {}, requests }) {
  const result = {};
  for (const [key, value] of Object.entries(requests)) {
    result[key] = !Array.isArray(value?.docs) ? value : { ...value, docs: value.docs.map(doc => typeof doc === 'string' ? works[doc]
      : doc.ref ? { ...works[doc.ref], editions: doc.editions } : doc) };
  }
  return result;
}

export function loadResponses(id) {
  const file = path.join(RESPONSE_DIR, `${id}.json`);
  return existsSync(file) ? unpackRequests(JSON.parse(readFileSync(file, 'utf8'))) : null;
}

export function listResponseFiles() {
  return existsSync(RESPONSE_DIR) ? readdirSync(RESPONSE_DIR).filter(name => name.endsWith('.json')) : [];
}

export function replayRead(requests, missing = []) {
  return async requestPath => {
    const key = requestKey(requestPath);
    if (!requests || !(key in requests)) {
      missing.push(key);
      throw new Error(`No captured response for ${key}`);
    }
    // Discovery code may annotate parsed objects; give every read a copy.
    return structuredClone(requests[key]);
  };
}

export function matchesExpectation(expectation, book) {
  if (!book) return false;
  if (expectation.workId) return book.workId === expectation.workId;
  const title = expectation.title ? new RegExp(expectation.title, 'iu') : null;
  const author = expectation.author ? new RegExp(expectation.author, 'iu') : null;
  return (!title || title.test(book.title || '')) && (!author || (book.authors || []).some(name => author.test(name)));
}

export function rankOf(expectation, books) {
  const index = books.findIndex(book => matchesExpectation(expectation, book));
  return index < 0 ? null : index + 1;
}

export function summarize(rows) {
  const total = rows.length;
  const top1 = rows.filter(row => row.rank === 1).length;
  const top3 = rows.filter(row => row.rank && row.rank <= 3).length;
  return { total, top1, top3, top1Rate: total ? top1 / total : 0, top3Rate: total ? top3 / total : 0 };
}

export function formatTable(rows) {
  const lines = rows.map(row => {
    const mark = row.rank === 1 ? 'top1' : row.rank && row.rank <= 3 ? 'top3' : 'MISS';
    const first = row.first ? `${row.first.title} / ${(row.first.authors || []).slice(0, 2).join(', ')}` : '(no results)';
    return `${mark.padEnd(5)}${String(row.rank ?? '-').padStart(4)}  ${row.query.padEnd(40)} ${first.slice(0, 70)}${row.error ? `  [${row.error}]` : ''}`;
  });
  const { total, top1, top3 } = summarize(rows);
  return [`${'hit'.padEnd(5)}${'rank'.padStart(4)}  ${'query'.padEnd(40)} first result`, ...lines,
    `top-1: ${top1}/${total} (${(100 * top1 / total).toFixed(1)}%)   top-3: ${top3}/${total} (${(100 * top3 / total).toFixed(1)}%)`].join('\n');
}

// Replays one golden query through the real discovery and public search path.
// Google Books (the second source) returns nothing offline.
export async function evaluateQuery(entry, { createWorkDiscovery, createPublicBookService }) {
  const missing = [];
  const discovery = createWorkDiscovery({ read: replayRead(loadResponses(entry.id), missing), fallbackText: async () => [] });
  const service = createPublicBookService({ searchByText: discovery.searchPage });
  let candidates = [], error;
  try { ({ candidates } = await service.search({ query: entry.query })); } catch (failure) { error = failure.code || failure.message; }
  return { id: entry.id, query: entry.query, category: entry.category, rank: rankOf(entry, candidates), first: candidates[0],
    top: candidates.slice(0, 5), missing, ...(error ? { error } : {}) };
}

export async function evaluateGolden(modules, entries = loadGolden()) {
  const rows = [];
  for (const entry of entries) rows.push(await evaluateQuery(entry, modules));
  return rows;
}
