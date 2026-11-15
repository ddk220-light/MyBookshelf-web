// Follow the app's default catalog choice for the two KALNET/IndCat institutions.
// Route failures remain in the report even when the wrapper falls back successfully.
import fs from 'node:fs';
import path from 'node:path';
import { getLibraryById } from '../../server/services/directory.js';
import { getProvider, withProviderRouteExecution } from '../../server/services/providers/index.js';
import { clearHttpCache, withCatalogOperation, withCatalogSuboperation } from '../../server/services/providers/http.js';
import { createRobotsPolicy } from '../../server/services/providers/robots.js';
import { createCatalogLookup } from '../../server/services/catalog-lookup/index.js';
import { PLATFORMS } from '../../server/services/catalog-lookup/platforms.js';
import { createMemoryHostGate } from '../../server/catalog-store/hostGate.js';
import { createCatalogBookKey } from '../../server/public-v2/contracts.js';

const args = process.argv.slice(2);
const option = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
const output = option('--output'), keralaCount = Number(option('--kerala-count', '1'));
if (!output || output.startsWith('--') || !Number.isInteger(keralaCount) || keralaCount < 1 || keralaCount > 10) {
  throw Error('Usage: node tools/catalog-hardening/academic-preferred-routes.mjs --output report.json [--kerala-count 1..10]');
}
const titleKey = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
const report = { schemaVersion: 1, includeInCoverage: false, startedAt: new Date().toISOString(),
  method: 'Default getProvider title search, same scoped record, explicit-ID readRecord, then cold app lookup. Sequential institutions; production platform quotas and robots; own bulk waits outside operation deadlines. Preferred-route failures retained independently of fallback.', libraries: [] };
const policy = createRobotsPolicy(), hostGate = createMemoryHostGate(), requestsByHost = new Map();
const originalFetch = global.fetch;
let current, stage;
global.fetch = async (url, options) => {
  const u = new URL(url), event = { stage, host: u.host, path: u.pathname, method: options?.method || 'GET', startedAt: new Date().toISOString() };
  current.httpRequests.push(event);
  const recent = requestsByHost.get(u.host) || []; recent.push(Date.now()); requestsByHost.set(u.host, recent);
  try { const response = await originalFetch(url, options); event.status = response.status; return response; }
  catch (error) { event.error = { code: error.cause?.code || error.code || error.name, message: error.cause?.message || error.message }; throw error; }
};
const save = () => { fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true }); fs.writeFileSync(output + '.tmp', JSON.stringify(report, null, 2) + '\n'); fs.renameSync(output + '.tmp', output); };
async function capacity(routes, needed = 8) {
  for (const { entry } of routes) {
    const host = new URL(entry.baseUrl || entry.catalogUrl).host, limit = PLATFORMS[entry.platform].perMinute;
    while (true) {
      const now = Date.now(), recent = (requestsByHost.get(host) || []).filter(at => at > now - 60_100);
      requestsByHost.set(host, recent);
      if (recent.length + needed <= limit) break;
      const delay = Math.max(1, recent[0] + 60_100 - now);
      console.log(JSON.stringify({ waitingForBulkQuota: host, delayMs: delay }));
      await new Promise(resolve => setTimeout(resolve, Math.min(delay, 30_000)));
    }
  }
}
try {
  for (const libraryId of ['indcat:indcat-krla-695034', 'indcat:indcat-mgnd-686560']) {
    const library = getLibraryById(libraryId), provider = getProvider(library), routes = provider.catalogRoutes;
    const allowedHosts = new Set(routes.map(({ entry }) => new URL(entry.baseUrl || entry.catalogUrl).host));
    const robots = { check: url => allowedHosts.has(new URL(url).host) ? policy.check(url) : Promise.resolve({ allowed: false, delayMs: 0 }) };
    current = { libraryId, name: library.name, preferred: routes[0].entry.sourceConnectionId,
      startedAt: new Date().toISOString(), routeEvents: [], httpRequests: [], recorded: [], discovery: [], books: [] };
    report.libraries.push(current); save();
    const lookup = createCatalogLookup({ robots, hostGate, recorder: { readAnswers: async () => [], record: item => current.recorded.push({ stage, host: item.host, platform: item.platform, libraryId: item.entry.id, requests: item.requests, outcome: item.answer.outcome }) } });
    const search = async query => {
      await capacity(routes); clearHttpCache();
      const deadlineAt = Date.now() + 20_000, controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      try {
        return await withCatalogOperation({ maxRequests: 8, signal: controller.signal, robots: url => robots.check(url) }, () =>
          withProviderRouteExecution(async ({ entry, prefix, method }, task) => {
            const config = PLATFORMS[entry.platform], event = { stage, query, method, platform: entry.platform, host: new URL(entry.baseUrl || entry.catalogUrl).host, prefix };
            current.routeEvents.push(event);
            try {
              const rows = await withCatalogSuboperation({ maxRequests: config.book.maxRequests, signal: controller.signal,
                gate: (host, options) => hostGate.reserve(host, { ...options, perMinute: config.perMinute, spacingMs: config.minIntervalMs, deadlineAt: Math.min(deadlineAt, options.deadlineAt || deadlineAt) }) }, task);
              event.count = rows.length; return rows;
            } catch (error) { event.error = { code: error.code || error.name, message: error.message }; throw error; }
          }, () => provider.searchCatalog(query)));
      } finally { controller.abort(); clearTimeout(timer); }
    };
    let candidates = [];
    stage = 'discovery';
    for (const query of ['India', 'history']) {
      try {
        candidates = await search(query);
        current.discovery.push({ query, count: candidates.length, records: candidates.map(({ recordId, title }) => ({ recordId, title })) });
        save(); if (candidates.length) break;
      } catch (error) { current.discovery.push({ query, error: { code: error.code || error.name, message: error.message } }); save(); break; }
    }
    const preferredReturned = candidates.some(row => row.recordId.startsWith(routes[0].prefix));
    const wanted = libraryId.includes('-krla-') && preferredReturned ? keralaCount : 1;
    const seen = new Set();
    for (const seed of candidates) {
      if (current.books.length >= wanted) break;
      if (seen.has(titleKey(seed.title))) continue;
      seen.add(titleKey(seed.title));
      const book = { title: seed.title, recordId: seed.recordId, startedAt: new Date().toISOString() };
      current.books.push(book); save();
      try {
        stage = 'search'; const rows = await search(seed.title), hit = rows.find(row => row.recordId === seed.recordId && titleKey(row.title) === titleKey(seed.title));
        book.search = { query: seed.title, matchingRecord: Boolean(hit), matchedRecordId: hit?.recordId, count: rows.length };
        if (!hit) throw Error('Default title search did not return the chosen record');
        stage = 'readRecord'; await capacity(routes); clearHttpCache();
        const record = await lookup.readRecord({ library, recordId: seed.recordId, read: () => provider.resolveCatalogRecord(seed.recordId) });
        book.resolve = { ok: record?.recordId === seed.recordId && titleKey(record?.title) === titleKey(seed.title), recordId: record?.recordId, title: record?.title, observation: record?.observation };
        stage = 'lookup'; await capacity(routes); clearHttpCache();
        book.lookup = await lookup.lookupBook({ library, book: { bookKey: createCatalogBookKey(library.id, seed.recordId), recordId: seed.recordId,
          recordLibraryId: library.id, title: record.title, authors: record.authors || [], isbn13: record.isbn || undefined }, storedChecked: true });
        book.pass = book.search.matchingRecord && book.resolve.ok && book.lookup.outcome === 'found' && book.lookup.source === 'live';
      } catch (error) { book.error = { code: error.code || error.name, message: error.message }; }
      book.finishedAt = new Date().toISOString(); save();
      console.log(JSON.stringify({ libraryId, title: book.title, recordId: book.recordId, passed: book.pass || false, error: book.error, lookup: book.lookup }));
      if (!book.pass && current.books.length === 1) break;
    }
    current.preferredSearch = current.routeEvents.some(event => event.prefix === routes[0].prefix && event.count > 0)
      ? 'returned_records' : current.routeEvents.some(event => event.prefix === routes[0].prefix && event.error) ? 'failed' : 'empty';
    current.verifiedDefaultRoute = current.books.some(book => book.pass)
      ? current.books.find(book => book.pass).recordId.startsWith(routes[0].prefix) ? 'preferred' : 'primary_fallback' : 'unverified';
    current.finishedAt = new Date().toISOString(); save();
  }
} finally { global.fetch = originalFetch; report.finishedAt = new Date().toISOString(); save(); }
