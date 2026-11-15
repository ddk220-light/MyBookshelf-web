#!/usr/bin/env node
// Live, resumable IndCat verification. This makes real anonymous catalog reads.
// Example: node tools/catalog-hardening/indcat-run.mjs \
//   --codes BOMB_400032,BHUL_221005 --books 10 \
//   --output /tmp/indcat-results.json --capture-dir /tmp/indcat-captures
// Directory and public contribution counts default to committed/current inputs.
// --directory and --counts override them for frozen replay. --manifest accepts
// { cohort: 'wider-one-book', libraries: [{ libraryId: 'indcat:...' }] }.
// Candidates come from the selected member's catalog. Each pass requires a new
// title search returning the same record, a scoped record read, and the actual
// catalog-lookup result. A row/HTTP 200 alone never counts as a verified holding.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { fileURLToPath } from 'node:url';
import { searchCatalog, resolveCatalogRecord, parseIndcatSearch } from '../../server/services/providers/indcat.js';
import { withCatalogOperation, getText, clearHttpCache } from '../../server/services/providers/http.js';
import { createRobotsPolicy } from '../../server/services/providers/robots.js';
import { createCatalogLookup } from '../../server/services/catalog-lookup/index.js';
import { createCatalogBookKey } from '../../server/public-v2/contracts.js';
import { getAllLibraries } from '../../server/services/directory.js';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const name = process.argv[i], value = process.argv[i + 1];
  if (!name.startsWith('--') || !value) throw Error('Arguments must be --name value pairs. See the example at the top of this file.');
  args.set(name.slice(2), value);
}
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const entries = args.has('directory') ? await readJson(args.get('directory')) : getAllLibraries();
const counts = await readJson(args.get('counts') || new URL('../../docs/research/india-library-hardening/indcat-contribution-counts.json', import.meta.url));
const manifest = args.has('manifest') ? await readJson(args.get('manifest')) : null;
if (manifest && (!Array.isArray(manifest.libraries) || (manifest.cohort && manifest.cohort !== 'wider-one-book'))) {
  throw Error('--manifest requires a libraries array and optional cohort wider-one-book.');
}
if (manifest && args.has('codes')) throw Error('Use --manifest or --codes, not both.');
const manifestCodes = manifest?.libraries.map(item => {
  const id = typeof item === 'string' ? item : item.libraryId;
  const entry = entries.find(library => library.id === id);
  if (entry?.platform !== 'indcat' || !entry.indcatInstitutionCode) throw Error(`Manifest library is not a connected IndCat scope: ${id}`);
  return entry.indcatInstitutionCode;
});
const target = Number(args.get('books') || 10);
const limit = Number(args.get('limit') || 50);
if (!Number.isInteger(target) || target < 1 || target > 10 || !Number.isInteger(limit) || limit < 1 || limit > 407) throw Error('Use 1–10 books and 1–407 libraries.');
const ranked = Object.values(counts).sort((a, b) => b.count - a.count).map(row => row.code)
  .filter(code => entries.some(entry => entry.indcatInstitutionCode === code));
const selection = args.has('selection') ? await readJson(args.get('selection')) : null;
const selectedCodes = selection?.selectedLibraryIds?.map(id => entries.find(entry => entry.id === id)?.indcatInstitutionCode).filter(Boolean);
if (selection && !Array.isArray(selectedCodes)) throw Error('--selection must name a cohort manifest with selectedLibraryIds.');
const reserveCount = Number(args.get('reserve-count') || 0);
if (!Number.isInteger(reserveCount) || reserveCount < 0 || reserveCount > 50 || (reserveCount && !selection)) throw Error('--reserve-count requires --selection and a value from 0 to 50.');
const reserveCodes = selection ? [...selection.candidates].sort((a, b) => a.priorityOrder - b.priorityOrder)
  .filter(candidate => candidate.indcatInstitutionCode && !selection.selectedLibraryIds.includes(candidate.libraryId))
  .slice(0, reserveCount).map(candidate => candidate.indcatInstitutionCode) : [];
const codes = [...new Set(manifestCodes || (args.has('codes') ? args.get('codes').split(',').map(code => code.trim()).filter(Boolean)
  : selectedCodes ? [...selectedCodes, ...reserveCodes] : ranked.slice(0, limit)))];
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.resolve(args.get('output') || path.join(root, 'docs/research/india-library-hardening/indcat-results.json'));
let exclusions = [];
try { exclusions = await readJson(args.get('exclusions') || path.join(path.dirname(output), 'indcat-exclusions.json')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const exclusionFor = (libraryId, recordId) => exclusions.find(entry => entry.libraryId === libraryId && entry.recordId === recordId);
const captureDir = path.resolve(args.get('capture-dir') || path.join(os.tmpdir(), 'mybookshelf-indcat-captures'));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const requestLog = path.join(captureDir, `requests-${runId}.jsonl`);
await fs.mkdir(captureDir, { recursive: true });
await fs.mkdir(path.dirname(output), { recursive: true });
let report;
try { report = await readJson(output); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  report = { generatedAt: new Date().toISOString(), libraries: [] };
}
report.method = 'Member-known distinct titles; each pass requires an explicit scoped search returning the same record, record resolution within production lookup.readRecord budgets, and lookupBook found for that own-record identity. ISBN-origin checks are separate; each book states its cache condition. Holdings do not establish borrowing availability.';
for (const library of report.libraries) for (const book of library.books) {
  book.holdingsCache ||= 'warm after independently verified scoped record resolution';
  if (book.isbnHoldings && !book.isbnCache) book.isbnCache = 'warm; initial baseline followed the scoped record resolution';
  book.holdingVerified ??= book.passed;
  const excluded = exclusionFor(library.id, book.recordId);
  if (excluded) { book.exclusion = excluded.reason; book.passed = false; }
}
if (manifest?.cohort || selection) for (const library of report.libraries) {
  library.cohort = manifest?.cohort || (selection.selectedLibraryIds.includes(library.id) ? 'frozen-primary' : 'explicit-reserve');
}
report.runs ||= [];
report.runs.push({ runId, targetBooks: target, selectedCodes: codes, manifest: args.get('manifest') || null,
  providerSha256: createHash('sha256').update(await fs.readFile(new URL('../../server/services/providers/indcat.js', import.meta.url))).digest('hex'),
  pacing: 'One global sequential request queue, at least 2100 ms between starts; production robots checks and catalog budgets retained.' });
const save = async () => {
  report.updatedAt = new Date().toISOString();
  const temporary = output + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(report, null, 2) + '\n');
  await fs.rename(temporary, output);
};
const titleKey = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim();
const failure = error => ({ message: error.message, code: error.code || error.cause?.code || error.name });
const log = value => console.log(JSON.stringify(value));

// Queue every real request, including robots and a read whose caller timed out.
// That prevents a deadline from making a later operation overlap the old read.
const originalFetch = globalThis.fetch;
let lastStart = 0, requestNumber = 0, refused = false;
const requests = [];
const evidenceContext = new AsyncLocalStorage();
const stage = (code, name, operationId, task) => evidenceContext.run({ code, stage: name, operationId }, task);
async function transport(url, options = {}, context = {}) {
  if (refused) throw Object.assign(new Error('Catalog refused access earlier in this run'), { code: 'CATALOG_PROVIDER_BLOCKED' });
  const wait = lastStart + 2100 - Date.now();
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  lastStart = Date.now();
  const started = Date.now(), number = ++requestNumber;
  const capture = `${runId}-${context.code || 'policy'}-${String(number).padStart(5, '0')}-${options.method || 'GET'}.html`;
  const event = { runId, number, ...context, method: options.method || 'GET', url: String(url), at: new Date().toISOString() };
  try {
    const response = await originalFetch(url, options);
    const html = await response.clone().text();
    Object.assign(event, { status: response.status, bytes: html.length, durationMs: Date.now() - started, capture });
    requests.push(event);
    await fs.writeFile(path.join(captureDir, capture), html);
    if ([401, 403, 429].includes(response.status) && !String(url).endsWith('/robots.txt')) refused = true;
    await fs.appendFile(requestLog, JSON.stringify(event) + '\n');
    return response;
  } catch (error) {
    Object.assign(event, { error: error.message, errorCode: error.cause?.code || error.code, durationMs: Date.now() - started });
    requests.push(event);
    await fs.appendFile(requestLog, JSON.stringify(event) + '\n');
    throw error;
  }
}
let networkQueue = Promise.resolve();
globalThis.fetch = (...values) => {
  const context = evidenceContext.getStore() || {};
  const task = networkQueue.catch(() => {}).then(() => transport(values[0], values[1], context));
  networkQueue = task;
  return task;
};
const robots = createRobotsPolicy();
const lookup = createCatalogLookup({ robots, env: { CATALOG_LOOKUP_V2: 'all' } });
const scopedOperation = task => withCatalogOperation({ maxRequests: 8, robots: url => robots.check(url) }, task);

for (const code of codes) {
  const library = entries.find(entry => entry.indcatInstitutionCode === code);
  if (!library) { log({ event: 'unknown-library', code }); continue; }
  let evidence = report.libraries.find(entry => entry.code === code);
  if (evidence?.books.filter(book => book.passed).length >= target) continue;
  if (!evidence) {
    evidence = { id: library.id, code, name: library.name, rankedIndcatRecords: counts[code]?.count,
      startedAt: new Date().toISOString(), books: [], discovery: [], errors: [] };
    if (manifest?.cohort || selection) evidence.cohort = manifest?.cohort || (selection.selectedLibraryIds.includes(library.id) ? 'frozen-primary' : 'explicit-reserve');
    report.libraries.push(evidence);
  }
  const preferred = library.alternateCatalogs?.find(route => route.preferForLookup) || library;
  evidence.probeRoute = { platform: 'indcat', institutionCode: code, catalogUrl: library.catalogUrl,
    note: 'Title query and record resolution use this direct institution-scoped IndCat route. Own-record lookup preserves that identity; ISBN-origin lookup uses the app route selection.' };
  evidence.preferredAppSearchRoute = { platform: preferred.platform, catalogUrl: preferred.catalogUrl,
    alternate: preferred !== library, sourceConnectionId: preferred.sourceConnectionId || null };
  evidence.completed = false;
  log({ event: 'library-start', code, name: library.name });
  const candidates = [];
  const seenTitles = new Set(evidence.books.filter(book => book.passed).map(book => titleKey(book.query)));
  const seenRecords = new Set(evidence.books.filter(book => book.passed).map(book => book.recordId));
  const add = rows => {
    for (const row of rows) if (row.title.length >= 6 && !seenTitles.has(titleKey(row.title))
      && !candidates.some(candidate => titleKey(candidate.title) === titleKey(row.title))) candidates.push(row);
  };
  try {
    const url = new URL('https://indcat.inflibnet.ac.in/index.php/search/checkuniv');
    url.searchParams.set('getDetails', Buffer.from(JSON.stringify({ part_uni: code })).toString('base64'));
    const home = await stage(code, 'discovery', `${runId}:${code}:discovery`, () => scopedOperation(() =>
      getText(url.toString(), { deadlineAt: Date.now() + 30_000, maxResponseBytes: 2 * 1024 * 1024, redirect: 'manual' })));
    if (!home.ok) throw Object.assign(new Error('Institution scope page failed'), { code: 'HTTP_' + home.status });
    const first = parseIndcatSearch(home.text, code);
    evidence.discovery.push({ runId, query: null, total: first.total, records: first.records });
    add(first.records);
  } catch (error) { evidence.errors.push({ runId, stage: 'discovery', ...failure(error) }); }
  // A few extra candidates allow a malformed title or a crowded first page to
  // fail honestly without forcing it to count toward the ten verified books.
  for (const seed of ['History', 'Economics', 'Physics', 'Literature', 'India']) {
    if (candidates.length >= target + 6 || refused) break;
    try {
      const rows = await stage(code, 'discovery', `${runId}:${code}:discovery`, () => scopedOperation(() => searchCatalog(library, seed)));
      evidence.discovery.push({ runId, query: seed, records: rows });
      add(rows);
    } catch (error) { evidence.errors.push({ runId, stage: 'discovery', query: seed, ...failure(error) }); }
  }
  await save();
  for (const candidate of candidates) {
    if (evidence.books.filter(book => book.passed).length >= target || refused) break;
    if (seenTitles.has(titleKey(candidate.title)) || seenRecords.has(candidate.recordId)) continue;
    if (exclusionFor(library.id, candidate.recordId)) continue;
    seenTitles.add(titleKey(candidate.title));
    const operationId = `${runId}:${code}:${evidence.books.length + 1}`;
    const result = { runId, operationId, query: candidate.title, recordId: candidate.recordId, startedAt: new Date().toISOString(), passed: false };
    evidence.books.push(result);
    try {
      // Discovery can itself contain an exact title such as "History". A
      // counted probe must issue that title query independently, not reuse
      // discovery's cached search while claiming a new live title check.
      clearHttpCache();
      const started = Date.now(), found = await stage(code, 'title-search', operationId, () => scopedOperation(() => searchCatalog(library, candidate.title)));
      result.search = { durationMs: Date.now() - started, returned: found.length,
        sameRecord: found.some(row => row.recordId === candidate.recordId), records: found };
      if (!result.search.sameRecord) throw Object.assign(new Error('Known scoped record absent from first search page'), { code: 'SEARCH_TARGET_MISSING' });
      const controller = new AbortController();
      let resolved;
      try {
        resolved = await stage(code, 'resolve', operationId, () => lookup.readRecord({ library, signal: controller.signal,
          read: () => resolveCatalogRecord(library, candidate.recordId) }));
      } finally { controller.abort(); }
      result.resolved = { title: resolved.title, authors: resolved.authors, isbn13: resolved.isbn || null,
        format: resolved.format || null, catalogUrl: resolved.catalogUrl, observation: resolved.observation };
      const book = { bookKey: createCatalogBookKey(library.id, candidate.recordId), recordId: candidate.recordId,
        recordLibraryId: library.id, title: resolved.title, authors: resolved.authors, ...(resolved.isbn ? { isbn13: resolved.isbn } : {}) };
      result.holdings = await stage(code, 'catalog-holdings', operationId, () => lookup.lookupBook({ library, book, storedChecked: true }));
      result.holdingsCache = 'warm after independently verified scoped record resolution';
      result.holdingVerified = result.holdings.outcome === 'found' && resolved.observation?.outcome === 'in_catalog'
        && resolved.observation.locations?.some(location => location.name === library.name);
      result.passed = result.holdingVerified && resolved.format !== 'Serial';
      if (resolved.format === 'Serial') result.exclusion = 'Explicit MARC serial; holding verified but excluded from the monograph count.';
      if (result.passed) seenRecords.add(candidate.recordId);
      if (resolved.isbn) {
        clearHttpCache();
        result.isbnCache = 'cold';
        result.isbnHoldings = await stage(code, 'isbn-holdings', operationId, () => lookup.lookupBook({ library,
          book: { bookKey: 'v1:isbn:' + resolved.isbn, isbn13: resolved.isbn, title: resolved.title, authors: resolved.authors }, storedChecked: true }));
      }
    } catch (error) { result.error = failure(error); }
    await networkQueue.catch(() => {});
    result.requests = requests.filter(event => event.operationId === operationId).map(event => ({ number: event.number, stage: event.stage,
      method: event.method, status: event.status, error: event.error, durationMs: event.durationMs, capture: event.capture }));
    result.finishedAt = new Date().toISOString();
    await save();
    log({ event: 'book', code, query: result.query, passed: result.passed, holdings: result.holdings?.outcome,
      isbn: result.isbnHoldings?.outcome, reason: result.isbnHoldings?.reason, error: result.error,
      passes: evidence.books.filter(book => book.passed).length });
  }
  evidence.passedBooks = evidence.books.filter(book => book.passed).length;
  evidence.isbnFound = evidence.books.filter(book => book.isbnHoldings?.outcome === 'found').length;
  evidence.completed = true;
  evidence.finishedAt = new Date().toISOString();
  await save();
  log({ event: 'library-complete', code, passedBooks: evidence.passedBooks, isbnFound: evidence.isbnFound });
  if (refused) break;
}
await networkQueue.catch(() => {});
