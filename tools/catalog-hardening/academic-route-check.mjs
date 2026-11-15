// A cold end-to-end check of the directory's preferred Mizoram route, including
// the metadata API's recordId budget and the actual host/health attribution.
import fs from 'node:fs';
import path from 'node:path';
import { getLibraryById } from '../../server/services/directory.js';
import { getProvider } from '../../server/services/providers/index.js';
import { clearHttpCache, withCatalogOperation } from '../../server/services/providers/http.js';
import { createRobotsPolicy } from '../../server/services/providers/robots.js';
import { createCatalogLookup, createHostGuard } from '../../server/services/catalog-lookup/index.js';
import { createMemoryHostGate } from '../../server/catalog-store/hostGate.js';
import { createCatalogBookKey } from '../../server/public-v2/contracts.js';

const position = process.argv.indexOf('--output');
const output = position >= 0 ? process.argv[position + 1] : null;
if (!output || output.startsWith('--')) throw Error('Usage: node tools/catalog-hardening/academic-route-check.mjs --output report.json');
const manifest = JSON.parse(fs.readFileSync(new URL('./manifests/academic-ten-books.json', import.meta.url)));
const selected = manifest.libraries.find(item => item.libraryId === 'indcat:indcat-mizu-796012');
const library = getLibraryById(selected.libraryId), seed = selected.candidates[0];
const alternate = library.alternateCatalogs.find(route => route.platform === 'discovery-academic');
const allowedHost = new URL(alternate.catalogUrl).host;
const policy = createRobotsPolicy(), memoryGate = createMemoryHostGate(), originalFetch = global.fetch;
const httpRequests = [], hostSlots = [], hostGuards = [], recorded = [], refusedHosts = [];
let stage = 'search';
global.fetch = async (url, options) => {
  const parsed = new URL(url);
  httpRequests.push({ stage, host: parsed.host, path: parsed.pathname, method: options?.method || 'GET' });
  return originalFetch(url, options);
};
const robots = { check: url => {
  const host = new URL(url).host;
  if (host !== allowedHost) { refusedHosts.push(host); return Promise.resolve({ allowed: false, delayMs: 0 }); }
  return policy.check(url);
} };
const hostGate = { reserve: (host, options) => {
  hostSlots.push({ stage, host, perMinute: options.perMinute, spacingMs: options.spacingMs,
    deadlineRemainingMs: Math.max(0, options.deadlineAt - Date.now()) });
  return memoryGate.reserve(host, options);
} };
const baseGuard = createHostGuard();
const guard = { ...baseGuard, acquire: async (host, limit, options) => {
  const item = { stage, host, limit }; hostGuards.push(item);
  const release = await baseGuard.acquire(host, limit, options);
  return () => { item.released = true; release(); };
} };
const lookup = createCatalogLookup({ robots, hostGate, guard, recorder: {
  readAnswers: async () => [], record: item => recorded.push({ stage, libraryId: item.entry.id,
    host: item.host, platform: item.platform, outcome: item.answer.outcome, live: item.live, requests: item.requests }),
} });
const provider = getProvider(library);
const book = { title: seed.title, recordId: seed.recordId, startedAt: new Date().toISOString() };
const report = { schemaVersion: 1, method: 'One cold title query, readRecord with explicit scoped ID, then cold lookupBook; production route budgets and robots; other hosts blocked before network.',
  libraries: [{ libraryId: library.id, name: library.name, route: alternate.academicCatalogId, books: [book] }],
  httpRequests, hostSlots, hostGuards, recorded, refusedHosts };
try {
  clearHttpCache();
  const rows = await withCatalogOperation({ maxRequests: 6, robots: url => robots.check(url),
    gate: (host, options) => hostGate.reserve(host, { ...options, perMinute: 10 }) }, () => provider.searchCatalog(seed.title));
  const hit = rows.find(row => row.recordId === seed.recordId);
  book.search = { query: seed.title, matchingRecord: Boolean(hit), matchedRecordId: hit?.recordId, count: rows.length };
  if (!hit) throw Error('The intended scoped record was not returned');
  stage = 'readRecord'; clearHttpCache();
  const record = await lookup.readRecord({ library, recordId: seed.recordId, read: () => provider.resolveCatalogRecord(seed.recordId) });
  book.resolve = { ok: record?.recordId === seed.recordId, recordId: record?.recordId, title: record?.title, observation: record?.observation };
  stage = 'lookup'; clearHttpCache();
  book.lookup = await lookup.lookupBook({ library, book: { bookKey: createCatalogBookKey(library.id, seed.recordId),
    recordId: seed.recordId, recordLibraryId: library.id, title: record.title, authors: record.authors || [], isbn13: record.isbn || undefined }, storedChecked: true });
  book.pass = book.search.matchingRecord && book.resolve.ok && book.lookup.outcome === 'found' && book.lookup.source === 'live';
} catch (error) {
  book.error = { code: typeof error.code === 'string' ? error.code : error.name, message: error.message };
} finally { global.fetch = originalFetch; }
report.finishedAt = new Date().toISOString();
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ libraryId: library.id, passed: book.pass || false, lookup: book.lookup, hosts: [...new Set(httpRequests.map(item => item.host))], recorded }));
