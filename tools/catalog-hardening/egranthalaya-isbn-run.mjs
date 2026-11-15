import fs from 'node:fs';
import path from 'node:path';
import { getLibraryById } from '../../server/services/directory.js';
import { createCatalogLookup } from '../../server/services/catalog-lookup/index.js';
import { createRobotsPolicy } from '../../server/services/providers/robots.js';
import { clearHttpCache } from '../../server/services/providers/http.js';
import { validateAndNormalize } from '../../server/services/isbn.js';
import { parseSearch } from '../../server/services/providers/egranthalaya.js';

const [manifestPath, outputPath] = process.argv.slice(2);
if (!manifestPath || !outputPath) throw new Error('Usage: node tools/catalog-hardening/egranthalaya-isbn-run.mjs manifest.json output.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const original = getLibraryById(manifest.libraryId);
if (original?.platform !== 'egranthalaya' || original.country !== 'IN') throw new Error('Expected a connected Indian eG member');
const overrides = manifest.overrides || {};
if (Object.keys(overrides).some(key => !['publicCatalogTimeoutMs', 'egranthalayaMemberProbeMs', 'egranthalayaHyphenatedIsbnFirst'].includes(key))) throw new Error('Unsupported diagnostic override');
const library = { ...original, ...overrides };
const output = { schemaVersion: 1, libraryId: library.id, name: library.name,
  startedAt: new Date().toISOString(), overrides, books: [] };
const filename = path.resolve(outputPath);
fs.mkdirSync(path.dirname(filename), { recursive: true });
const save = () => { fs.writeFileSync(filename + '.tmp', JSON.stringify(output, null, 2) + '\n'); fs.renameSync(filename + '.tmp', filename); };
const lookup = createCatalogLookup({ robots: createRobotsPolicy() });
let traces = [], activeIsbn, lastRequest = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const delay = lastRequest + 1000 - Date.now();
  if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
  lastRequest = Date.now();
  const start = Date.now(), isbn = activeIsbn, fields = new URLSearchParams(options.body);
  const trace = { url: String(url), method: options.method || 'GET', startedAt: new Date().toISOString(),
    ...(options.method === 'POST' ? { query: fields.get('txt_Search'), member: fields.get('DDL_Library') } : {}) };
  traces.push(trace);
  try {
    const response = await originalFetch(url, options);
    trace.status = response.status;
    if (options.method === 'POST') trace.parsed = parseSearch(await response.clone().text(), {
      isbn, libraryCode: library.egranthalayaLibraryCode, multipleRecords: true,
      clusterSearch: fields.get('DDL_Library') === 'All Libraries' });
    trace.ms = Date.now() - start;
    return response;
  } catch (error) { trace.error = { code: error.code || error.name, message: error.message }; trace.ms = Date.now() - start; throw error; }
};
try {
  for (const book of manifest.books) {
    activeIsbn = validateAndNormalize(book.isbn13);
    if (!activeIsbn) throw new Error('Invalid ISBN in diagnostic manifest');
    clearHttpCache(); traces = [];
    const answer = await lookup.lookupBook({ library, book: { bookKey: 'v1:isbn:' + activeIsbn,
      isbn13: activeIsbn, title: book.title || '', authors: book.authors || [] }, editionScope: 'exact', storedChecked: true });
    output.books.push({ ...book, answer, requests: traces });
    save();
    console.log(JSON.stringify({ isbn13: activeIsbn, outcome: answer.outcome, reason: answer.reason, durationMs: answer.durationMs }));
  }
  output.completedAt = new Date().toISOString();
  save();
} finally { globalThis.fetch = originalFetch; }
