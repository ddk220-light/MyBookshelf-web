#!/usr/bin/env node
// Captures the Open Library responses the search code requests for each golden
// query (server/test/fixtures/search-ranking/golden-queries.json) and stores
// them, trimmed, as offline fixtures for server/services/searchRanking.eval.test.js.
//
//   node tools/search-ranking/capture.mjs              # queries without a fixture
//   node tools/search-ranking/capture.mjs --all        # refresh every query
//   node tools/search-ranking/capture.mjs --only id,id # refresh named queries
//
// Polite by design: one request at a time, at most one per second, a
// descriptive User-Agent and a hard request budget per run.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createWorkDiscovery } from '../../server/services/workDiscovery.js';
import { authorIntent } from '../../server/services/searchRelevance.js';
import { loadGolden, requestKey, trimResponse, packRequests, RESPONSE_DIR } from '../../server/test/searchRanking.js';

const USER_AGENT = 'MyBookshelf/1.0 (ranking research; https://mybookshelf.cloud/privacy)';
const INTERVAL_MS = 1100;
const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const budget = Number(option('--budget') || 200);
const only = option('--only')?.split(',').filter(Boolean);

let used = 0, lastAt = 0;
async function fetchLive(requestPath, query) {
  if (used >= budget) throw Object.assign(new Error(`request budget of ${budget} reached`), { code: 'BUDGET' });
  const wait = lastAt + INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  used++;
  lastAt = Date.now();
  const response = await fetch(`https://openlibrary.org${requestPath}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000) });
  lastAt = Date.now();
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${requestPath}`);
  return trimResponse(requestPath, await response.json(), query);
}

async function capture(entry) {
  const requests = {};
  let failure;
  const read = async requestPath => {
    const key = requestKey(requestPath);
    if (!(key in requests)) {
      try { requests[key] = await fetchLive(requestPath, entry.query); } catch (error) { failure ||= error; throw error; }
    }
    return structuredClone(requests[key]);
  };
  // Record exactly what the current discovery code asks for.
  const discovery = createWorkDiscovery({ read, fallbackText: async () => [] });
  await discovery.searchPage({ title: entry.query, author: '', max: 160 });
  // Also record the author-ordered request whenever any returned work has an
  // author named by the query, so the intent threshold can be tuned offline.
  const authorPath = `/search.json?${new URLSearchParams({ author: entry.query.replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim(),
    sort: 'readinglog', fields: 'key', limit: '40', offset: '0' })}`;
  const books = [];
  for (const [key, value] of Object.entries(requests)) {
    if (key.startsWith('/search.json') && Array.isArray(value?.docs)) {
      books.push(...value.docs.map(doc => ({ workId: doc.key, title: doc.title, authors: doc.author_name || [], searchAuthors: doc.author_alternative_name || [] })));
    }
  }
  if (!(requestKey(authorPath) in requests) && authorIntent(books, { title: entry.query }, { minWorks: 1, majority: false })) {
    const fields = 'key,title,author_name,author_key,cover_i,first_publish_year,edition_count,language,readinglog_count,want_to_read_count,already_read_count,ratings_count,subtitle,alternative_title,author_alternative_name';
    requests[requestKey(authorPath)] = await fetchLive(authorPath.replace('fields=key', `fields=${encodeURIComponent(fields)}`), entry.query);
  }
  // A fixture with a failed request would replay as an outage, not as data.
  if (failure) throw failure;
  return requests;
}

mkdirSync(RESPONSE_DIR, { recursive: true });
for (const entry of loadGolden()) {
  const file = path.join(RESPONSE_DIR, `${entry.id}.json`);
  if (only ? !only.includes(entry.id) : !args.includes('--all') && existsSync(file)) continue;
  const before = used;
  try {
    const requests = await capture(entry);
    writeFileSync(file, `${JSON.stringify({ query: entry.query, capturedAt: new Date().toISOString().slice(0, 10), ...packRequests(requests) })}\n`);
    console.log(`${entry.id}: ${used - before} requests`);
  } catch (error) {
    console.error(`${entry.id}: not saved (${error.message})`);
    if (error.code === 'BUDGET') break;
  }
}
console.log(`${used} live requests in total`);
