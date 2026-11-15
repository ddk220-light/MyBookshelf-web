import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { getLibraryById } from '../../server/services/directory.js';
import { createCatalogBookKey } from '../../server/public-v2/contracts.js';
import { createCatalogLookup } from '../../server/services/catalog-lookup/index.js';
import { createRobotsPolicy } from '../../server/services/providers/robots.js';
import { withCatalogOperation, clearHttpCache } from '../../server/services/providers/http.js';
import { validateAndNormalize } from '../../server/services/isbn.js';
import * as provider from '../../server/services/providers/egranthalaya.js';
import { verifiedBooks as verifiedRecords } from './probe.mjs';
import { normalizeBook } from './summarize.mjs';

const verifiedBooks = books => verifiedRecords(books.filter(book => {
  const normalized = normalizeBook(book);
  return normalized.completeAttempt && normalized.eligibleBook;
}));

// Serial eG-specific runner: retains member statistics and public request
// traces in addition to the common runner's search -> record -> cold lookup.
// Optional EG_RAW_DIR saves public HTML locally; never commit its form state.
const [manifestPath, outputPath, resumeFlag] = process.argv.slice(2);
if (!manifestPath || !outputPath || (resumeFlag && resumeFlag !== '--resume')) {
  throw new Error('Usage: node tools/catalog-hardening/egranthalaya-run.mjs manifest.json output.json [--resume]');
}
const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const selections = Array.isArray(manifest) ? manifest : manifest.libraries;
if (!Array.isArray(selections)) throw new Error('Manifest must contain a libraries array');
const filename = path.resolve(outputPath);
const previous = resumeFlag && fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : {};
const report = { ...previous, schemaVersion: 1, runId: previous.runId || `india-egranthalaya-${Date.now()}`,
  runStatus: 'running',
  startedAt: previous.startedAt || new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  adapterSha256: createHash('sha256').update(fs.readFileSync(new URL('../../server/services/providers/egranthalaya.js', import.meta.url))).digest('hex'),
  libraries: previous.libraries || [] };
delete report.completedAt;
fs.mkdirSync(path.dirname(filename), { recursive: true });
const save = () => { fs.writeFileSync(filename + '.tmp', JSON.stringify(report, null, 2) + '\n'); fs.renameSync(filename + '.tmp', filename); };
const errorInfo = error => ({ code: error.code || error.name, message: error.message });
const titleKey = value => String(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim();
const robots = createRobotsPolicy(), lookup = createCatalogLookup({ robots });
const rawDirectory = process.env.EG_RAW_DIR ? path.resolve(process.env.EG_RAW_DIR) : null;
if (rawDirectory) fs.mkdirSync(rawDirectory, { recursive: true });
let lastRequest = 0, sequence = 0, traces = [], stage, active;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const delay = lastRequest + 1000 - Date.now();
  if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
  lastRequest = Date.now();
  const start = Date.now(), context = active;
  const trace = { n: ++sequence, stage, url: String(url), method: options.method || 'GET', startedAt: new Date().toISOString() };
  traces.push(trace);
  try {
    const response = await originalFetch(url, options);
    trace.status = response.status;
    const readStatistics = trace.stage === 'discovery' && trace.method === 'GET';
    if (rawDirectory || readStatistics) {
      const html = await response.clone().text();
      trace.bytes = html.length;
      if (rawDirectory && context) fs.writeFileSync(path.join(rawDirectory, `${context.entry.egranthalayaLibraryCode}-${trace.n}.html`), html);
      const table = readStatistics && html.match(/<table\b[^>]*id="GridView_MyLibStat"[^>]*>([\s\S]*?)<\/table>/i);
      if (table && context) {
        const cells = [...table[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
          .map(cell => Number(cell[1].replace(/<[^>]*>/g, '').trim()));
        if (Number.isFinite(cells[0]) && Number.isFinite(cells[1])) context.output.catalogSize = {
          titles: cells[0], holdings: cells[1], sourceUrl: String(url), observedAt: new Date().toISOString(),
        };
      }
    }
    trace.ms = Date.now() - start;
    return response;
  } catch (error) { trace.error = errorInfo(error); trace.ms = Date.now() - start; throw error; }
};

async function operation(task, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await withCatalogOperation({ maxRequests: 6, signal: controller.signal,
      minIntervalMs: 1000, robots: url => robots.check(url) }, () => task(controller.signal));
  } finally { clearTimeout(timer); }
}

try {
  for (const selected of selections) {
    const config = typeof selected === 'string' ? { libraryId: selected } : selected;
    const { libraryId, required = 10, maxAttempts = 15, queries = ['India', 'History', 'Science'],
      checkIsbn = true, operationTimeoutMs = 100_000 } = config;
    if (!Number.isInteger(operationTimeoutMs) || operationTimeoutMs < 1 || operationTimeoutMs > 100_000
        || !Number.isInteger(required) || required < 1 || !Number.isInteger(maxAttempts) || maxAttempts < required || maxAttempts > 30) {
      throw new Error('Invalid bounded probe configuration for ' + libraryId);
    }
    const entry = getLibraryById(libraryId);
    if (entry?.platform !== 'egranthalaya' || entry.country !== 'IN') throw new Error('Expected a connected Indian eG library: ' + libraryId);
    const prior = report.libraries.find(item => item.libraryId === libraryId);
    if (prior && verifiedBooks(prior.books || []).length >= required) continue;
    // Resume only complete attempts; never combine partial stages from two runs.
    const output = { ...prior, libraryId, name: entry.name, platform: entry.platform, host: 'eg4.nic.in',
      catalogUrl: entry.catalogUrl, required, startedAt: prior?.startedAt || new Date().toISOString(),
      books: prior?.books?.filter(book => book.status) || [], discovery: prior?.discovery || [] };
    delete output.completedAt;
    delete output.summary;
    output.status = 'running';
    report.libraries = report.libraries.filter(item => item.libraryId !== libraryId);
    report.libraries.push(output);
    active = { entry, output };
    save();
    const seeds = [], seenTitles = new Set(), seenRecords = new Set();
    const addRows = (rows, explicit = false) => {
      for (const row of rows) if (row.recordId && row.title && !seenRecords.has(row.recordId)
          && (explicit || !seenTitles.has(titleKey(row.title)))) {
        seenTitles.add(titleKey(row.title)); seenRecords.add(row.recordId); seeds.push(row);
      }
    };
    // Explicit replay records retain their identities even when two distinct
    // records have the same title. The pass counter still deduplicates titles.
    addRows(config.candidates || [], true);
    for (const query of queries) {
      if (seeds.length >= maxAttempts) break;
      stage = 'discovery'; traces = [];
      const start = Date.now();
      try {
        const rows = await operation(() => provider.searchCatalog(entry, query), operationTimeoutMs);
        output.discovery.push({ query, count: rows.length, ms: Date.now() - start, requests: traces });
        addRows(rows);
      } catch (error) {
        output.discovery.push({ query, error: errorInfo(error), ms: Date.now() - start, requests: traces });
        if (error.code === 'CATALOG_PROVIDER_BLOCKED') break;
      } finally { save(); }
      if (seeds.length >= maxAttempts) break;
    }
    for (const seed of seeds.slice(0, maxAttempts)) {
      if (verifiedBooks(output.books).length >= required) break;
      if (output.books.some(book => book.recordId === seed.recordId && book.status)) continue;
      const book = { query: seed.title.slice(0, 160), title: seed.title, authors: seed.authors,
        ...(seed.originalTitle ? { originalTitle: seed.originalTitle } : {}),
        recordId: seed.recordId, isbn13: seed.isbn || null, catalogUrl: entry.catalogUrl, startedAt: new Date().toISOString() };
      output.books.push(book);
      const start = Date.now();
      try {
        stage = 'title-search'; traces = [];
        const searchStart = Date.now();
        const rows = await operation(() => provider.searchCatalog(entry, book.query), operationTimeoutMs);
        const matched = rows.find(row => row.recordId === book.recordId);
        book.search = { ok: Boolean(matched), matchingRecord: Boolean(matched), matchedRecordId: matched?.recordId || null,
          ...(matched?.title ? { matchingTitle: matched.title } : {}),
          returned: rows.length, ms: Date.now() - searchStart, requests: traces };
        if (!matched) { book.status = 'search_miss'; continue; }
        stage = 'resolve'; traces = [];
        const resolveStart = Date.now();
        // readRecord supplies the production operation itself. An enclosing
        // operation would replace its abort signal, host gate and request cap.
        const resolved = await lookup.readRecord({ library: entry,
          read: () => provider.resolveCatalogRecord(entry, book.recordId) });
        book.resolve = { ok: resolved.recordId === book.recordId && Boolean(resolved.title), title: resolved.title,
          authors: resolved.authors, isbn13: resolved.isbn, observation: resolved.observation,
          ms: Date.now() - resolveStart, requests: traces };
        book.isbn13 = validateAndNormalize(resolved.isbn13 || resolved.isbn || '') || null;
        book.recordUrl = traces.find(trace => trace.url.includes('/Details.aspx?'))?.url;
        clearHttpCache(); stage = 'cold-lookup'; traces = [];
        const lookupStart = Date.now();
        const answer = await lookup.lookupBook({ library: entry, book: { bookKey: createCatalogBookKey(libraryId, book.recordId),
          recordId: book.recordId, recordLibraryId: libraryId, title: resolved.title, authors: resolved.authors, isbn13: book.isbn13 }, storedChecked: true });
        book.lookup = { ...answer, ms: Date.now() - lookupStart, trace: traces };
        if (checkIsbn && book.isbn13) {
          clearHttpCache(); stage = 'isbn-lookup'; traces = [];
          const isbnStart = Date.now();
          const answer = await lookup.lookupBook({ library: entry, book: { bookKey: 'v1:isbn:' + book.isbn13,
            isbn13: book.isbn13, title: resolved.title, authors: resolved.authors }, editionScope: 'exact', storedChecked: true });
          book.isbnLookup = { ...answer, ms: Date.now() - isbnStart, trace: traces };
        }
        book.status = book.resolve.ok && !normalizeBook(book).resolved ? 'title_mismatch'
          : verifiedBooks([book]).length ? 'passed' : 'lookup_failed';
      } catch (error) { book.status = 'failed'; book.error = errorInfo(error); book.failedStage = stage; book.requests = traces; }
      finally {
        book.ms = Date.now() - start;
        console.log(JSON.stringify({ libraryId, recordId: book.recordId, status: book.status, verified: verifiedBooks(output.books).length }));
        save();
      }
    }
    output.completedAt = new Date().toISOString();
    output.verified = verifiedBooks(output.books).length;
    output.summary = { tested: output.books.length, passed: output.verified };
    output.status = output.verified >= required ? 'passed' : output.verified ? 'partial' : 'failed';
    save();
  }
  report.completedAt = new Date().toISOString();
  report.runStatus = 'completed';
  save();
} finally { globalThis.fetch = originalFetch; }
