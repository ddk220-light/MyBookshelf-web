import fs from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLibraryById } from '../../server/services/directory.js';
import { getProvider } from '../../server/services/providers/index.js';
import { withCatalogOperation, clearHttpCache } from '../../server/services/providers/http.js';
import { createRobotsPolicy } from '../../server/services/providers/robots.js';
import { createMemoryHostGate } from '../../server/catalog-store/hostGate.js';
import { createCatalogLookup } from '../../server/services/catalog-lookup/index.js';
import { createCatalogBookKey } from '../../server/public-v2/contracts.js';

const canonical = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const rowsOf = value => Array.isArray(value) ? value : value?.records || [];
const errorOf = error => ({ code: error?.code || error?.name || 'ERROR', message: String(error?.message || error).slice(0, 400) });

export function bookEligibility(record) {
  const format = record?.observation?.format || record?.format || '';
  if (/serial|journal|magazine|periodical|bound\s*volume|newspaper|non[- ]?book|dvd|video|audio/i.test(format)) return { eligibleBook: false, eligibilityReason: `Non-book or ambiguous serial item type: ${format}` };
  if (/books?|general|reference|refrence|text|report|thesis|dissertation/i.test(format)) return { eligibleBook: true, eligibilityReason: `Catalog book item type: ${format}` };
  return { eligibleBook: null, eligibilityReason: `Book item type not confirmed: ${format || 'not exposed'}` };
}

export function verifiedKohaBooks(books) {
  const records = new Set(), titles = new Set();
  return books.filter(book => {
    const title = canonical(book.title);
    if (book.eligibleBook !== true || !book.recordId || !title || records.has(book.recordId) || titles.has(title)
      || !book.queriedRecordFound || !book.resolvedRecordFound || book.lookup?.outcome !== 'found' || book.lookup?.source !== 'live') return false;
    records.add(book.recordId); titles.add(title); return true;
  });
}

/** Read-only public catalog audit. Inputs are existing runtime directory IDs;
 * no URL overrides, credentials, deployment calls or persistent stores. */
export async function runKohaManifest(manifest, { onProgress = () => {}, checkpoint = async () => {}, previous = null } = {}) {
  const selected = Array.isArray(manifest) ? manifest : manifest.libraries;
  if (!Array.isArray(selected)) throw new Error('Manifest needs a libraries array');
  const report = previous || { schemaVersion: 1, startedAt: new Date().toISOString(), method: 'Native Koha: discover titles, query each expected record, resolve scoped holdings, then cold app lookup; explicit book item types only.', results: [] };
  const robots = createRobotsPolicy(), hostGate = createMemoryHostGate();
  const lookup = createCatalogLookup({ robots, hostGate });
  const groups = new Map();
  for (const item of selected) {
    const config = typeof item === 'string' ? { libraryId: item } : item;
    if (report.results.some(result => result.id === config.libraryId && result.completedAt)) continue;
    const interrupted = report.results.filter(result => result.id === config.libraryId);
    if (interrupted.length) {
      report.interruptedAttempts = [...(report.interruptedAttempts || []), ...interrupted];
      report.results = report.results.filter(result => result.id !== config.libraryId);
    }
    const original = getLibraryById(config.libraryId);
    if (!original || original.country !== 'IN' || original.platform !== 'koha') throw new Error(`Expected an existing Indian Koha ID: ${config.libraryId}`);
    // Measure this adapter without counting an alternate union catalog as a
    // native Koha success. Identity and branch pins remain unchanged.
    const library = { ...original, alternateCatalogs: [] };
    let host;
    try { host = new URL(library.baseUrl).host; } catch { host = `unconfigured:${library.id}`; }
    if (!groups.has(host)) groups.set(host, []);
    groups.get(host).push({ library, config });
  }
  const queue = [...groups.entries()];
  async function operation(task) {
    const controller = new AbortController(), started = Date.now();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      return await withCatalogOperation({ maxRequests: 12, signal: controller.signal, minIntervalMs: 3000,
        robots: url => robots.check(url), gate: (host, options) => hostGate.reserve(host, { ...options,
          perMinute: 15, spacingMs: Math.max(3000, options.spacingMs || 0) }) },
      async op => ({ value: await task(), requests: op.requests, durationMs: Date.now() - started }));
    } catch (error) { return { error: errorOf(error), durationMs: Date.now() - started }; }
    finally { clearTimeout(timer); }
  }
  async function audit(library, config, host) {
    const provider = getProvider(library), required = config.required || 10;
    const result = { id: library.id, name: library.name, host, startedAt: new Date().toISOString(), required, books: [], discovery: [] };
    report.results.push(result);
    if (!provider?.searchCatalog || !provider?.resolveCatalogRecord) {
      result.status = 'unsupported'; result.reason = 'Runtime catalog search/record interface unavailable';
    } else {
      const candidates = new Map(), titles = new Set(), attempted = new Set();
      const add = rows => { for (const row of rows) {
        const title = canonical(row.title), id = String(row.recordId || '');
        if (id && title && !titles.has(title)) { candidates.set(id, row); titles.add(title); }
      } };
      add(config.candidates || []);
      const queries = [...(config.queries || ['history', 'computer', 'india'])];
      const maximum = config.maxAttempts || Math.max(3, required * 2);
      while (verifiedKohaBooks(result.books).length < required && attempted.size < maximum) {
        let seed = [...candidates.values()].find(row => !attempted.has(String(row.recordId)));
        if (!seed) {
          if (!queries.length) break;
          const query = queries.shift(), response = await operation(() => provider.searchCatalog(query));
          const records = rowsOf(response.value);
          result.discovery.push({ query, records, ...response, value: undefined });
          onProgress({ id: library.id, phase: 'discovery', records: records.length, error: response.error });
          await checkpoint(report);
          if (response.error?.code === 'CATALOG_PROVIDER_BLOCKED') break;
          add(records); continue;
        }
        attempted.add(String(seed.recordId));
        const query = seed.query || String(seed.title).split(/\s+\/\s+/)[0].replace(/[\s:;]+/g, ' ').trim().slice(0, 150);
        const book = { query, seedRecordId: String(seed.recordId), seedTitle: seed.title, startedAt: new Date().toISOString(), catalogPass: false };
        result.books.push(book);
        const searched = await operation(() => provider.searchCatalog(query));
        book.search = { ...searched, value: undefined, records: rowsOf(searched.value).length };
        book.queriedRecordFound = rowsOf(searched.value).some(row => String(row.recordId) === book.seedRecordId);
        if (book.queriedRecordFound) {
          const resolved = await operation(() => provider.resolveCatalogRecord(book.seedRecordId));
          book.resolve = { ...resolved, value: undefined };
          const record = resolved.value;
          book.resolvedRecordFound = String(record?.recordId || '') === book.seedRecordId;
          Object.assign(book.resolve, { ok: book.resolvedRecordFound, recordId: record?.recordId,
            title: record?.title, observation: record?.observation });
          if (book.resolvedRecordFound) {
            Object.assign(book, { recordId: String(record.recordId), title: record.title, authors: record.authors,
              isbn: record.isbn13 || record.isbn || null, catalogUrl: record.catalogUrl, observation: record.observation }, bookEligibility(record));
            if (book.eligibleBook === true) {
              try {
                clearHttpCache();
                book.lookup = await lookup.lookupBook({ library, storedChecked: true,
                  book: { bookKey: createCatalogBookKey(library.id, book.recordId), recordId: book.recordId,
                    recordLibraryId: library.id, title: book.title, authors: book.authors, isbn13: book.isbn || undefined } });
                if (config.checkIsbn && book.isbn) {
                  clearHttpCache();
                  book.isbnLookup = await lookup.lookupBook({ library, storedChecked: true, editionScope: 'exact',
                    book: { bookKey: `v1:isbn:${book.isbn}`, isbn13: book.isbn, title: book.title, authors: book.authors } });
                }
              } catch (error) { book.lookupError = errorOf(error); }
            }
          }
        }
        book.catalogPass = verifiedKohaBooks([book]).length === 1;
        onProgress({ id: library.id, phase: 'book', recordId: book.seedRecordId, eligibleBook: book.eligibleBook, outcome: book.lookup?.outcome });
        await checkpoint(report);
        if ([book.search?.error, book.resolve?.error].some(error => error?.code === 'CATALOG_PROVIDER_BLOCKED')) break;
      }
      result.passedBooks = verifiedKohaBooks(result.books).length;
      result.passed = result.passedBooks >= required;
      result.status = result.passed ? 'passed' : result.passedBooks ? 'partial' : 'failed';
    }
    result.completedAt = new Date().toISOString();
    await checkpoint(report);
    return result;
  }
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) {
      const [host, libraries] = queue.shift();
      let refusal = null, consecutiveUnavailable = 0;
      for (const { library, config } of libraries) {
        if (refusal) {
          report.results.push({ id: library.id, name: library.name, host, status: 'not_attempted', reason: refusal,
            books: [], completedAt: new Date().toISOString() });
          await checkpoint(report); continue;
        }
        const result = await audit(library, config, host);
        const errors = [...(result.discovery || []).map(row => row.error), ...result.books.flatMap(book => [book.search?.error, book.resolve?.error])].filter(Boolean);
        if (errors.some(error => error.code === 'CATALOG_PROVIDER_BLOCKED')) refusal = 'Runtime access/robots policy refused a shared-host request; no further requests sent';
        else if (!result.books.length && errors.length) consecutiveUnavailable += 1;
        else consecutiveUnavailable = 0;
        if (consecutiveUnavailable >= 3) refusal = 'Three successive member discovery failures at shared host; remaining members not tested';
      }
    }
  }));
  report.completedAt = new Date().toISOString(); await checkpoint(report); return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [manifestPath, outputPath] = process.argv.slice(2);
  if (!manifestPath || !outputPath) throw new Error('Usage: node tools/catalog-hardening/koha-run.mjs manifest.json output.json [--resume]');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  let previous = null;
  if (process.argv.includes('--resume')) {
    try { previous = JSON.parse(await fs.readFile(outputPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await fs.mkdir(dirname(outputPath), { recursive: true });
  // Serialize checkpoints from the independent host workers.
  let writing = Promise.resolve();
  const checkpoint = report => {
    const snapshot = JSON.stringify(report, null, 2) + '\n';
    writing = writing.then(() => fs.writeFile(outputPath + '.tmp', snapshot)).then(() => fs.rename(outputPath + '.tmp', outputPath));
    return writing;
  };
  const report = await runKohaManifest(manifest, { previous, checkpoint, onProgress: item => console.log(JSON.stringify(item)) });
  console.log(JSON.stringify({ completed: true, libraries: report.results.length, passed: report.results.filter(row => row.passed).length }));
}
