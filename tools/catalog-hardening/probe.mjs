import { getLibraryById } from '../../server/services/directory.js';
import { getProvider } from '../../server/services/providers/index.js';
import { withCatalogOperation, clearHttpCache } from '../../server/services/providers/http.js';
import { createRobotsPolicy } from '../../server/services/providers/robots.js';
import { createMemoryHostGate } from '../../server/catalog-store/hostGate.js';
import { createCatalogLookup } from '../../server/services/catalog-lookup/index.js';
import { platformFor, hostFor } from '../../server/services/catalog-lookup/platforms.js';
import { createCatalogBookKey } from '../../server/public-v2/contracts.js';
import { validateAndNormalize } from '../../server/services/isbn.js';

const canonical = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
const failure = error => ({ ok: false, code: error?.code || error?.name || 'ERROR', message: String(error?.message || error).slice(0,400) });
const rowsOf = result => Array.isArray(result) ? result : result?.records || [];
const refused = result => ['CATALOG_PROVIDER_BLOCKED', 'CATALOG_ROBOTS_DISALLOWED'].includes(result?.code)
  || result?.reason === 'blocked';

/** Only ten distinct books with a matching query, resolved identity, and an
 * actual app-layer found answer qualify. HTTP success or union hits do not. */
export function verifiedBooks(books) {
  const records = new Set(), titles = new Set();
  return books.filter(book => {
    const title = canonical(book.title);
    if (book.eligibleBook === false || book.countedForBookRequirement === false || book.exclusion
        || /serial|journal|magazine|periodical|bound\s*volume|newspaper|non[- ]?book|dvd|video|audio/i.test(book.resolve?.observation?.format || '')
        || !book.recordId || !title || records.has(book.recordId) || titles.has(title)
        || book.search?.matchingRecord !== true || book.resolve?.ok !== true
        || book.lookup?.outcome !== 'found' || book.lookup?.source !== 'live') return false;
    records.add(book.recordId); titles.add(title); return true;
  });
}

/** Use one runner per host family. All its operations share production host
 * caps and robots rules; probe calls never write accounts or production stores. */
export function createProbeRunner({ onProgress = () => {}, seeds = ['history', 'india', 'science', 'mathematics', 'economics', 'engineering'], requestSpacingMs = 0 } = {}) {
  const robots = createRobotsPolicy(), memoryGate = createMemoryHostGate();
  const hostGate = { reserve: (host,options) => memoryGate.reserve(host,{...options,
    spacingMs:Math.max(options.spacingMs || 0,requestSpacingMs)}) };
  const lookup = createCatalogLookup({ robots, hostGate });
  async function operation(entry, task, timeoutMs = 45_000) {
    const started = Date.now(), policy = platformFor(entry);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await withCatalogOperation({ maxRequests: 12, signal: controller.signal,
        robots: url => robots.check(url), minIntervalMs: policy?.minIntervalMs || 0,
        gate: (host, options) => hostGate.reserve(host, { ...options,
          perMinute: policy?.perMinute || 10, spacingMs: Math.max(options.spacingMs || 0, policy?.minIntervalMs || 0) }),
      }, async op => ({ ok: true, value: await task(), requests: op.requests, durationMs: Date.now()-started }));
    } catch(error) { return { ...failure(error), durationMs: Date.now()-started }; }
    finally { clearTimeout(timer); controller.abort(); }
  }

  async function probeLibrary(libraryId, { required = 10, maxAttempts = 18, queries = seeds, checkIsbn = true, candidates: supplied = [], operationTimeoutMs = 45_000 } = {}) {
    if (!Number.isInteger(operationTimeoutMs) || operationTimeoutMs < 1 || operationTimeoutMs > 100_000) throw new Error('operationTimeoutMs must be between 1 and 100000');
    const entry = getLibraryById(libraryId);
    if (!entry || entry.country !== 'IN') throw new Error('Expected an existing Indian library: '+libraryId);
    const provider = getProvider(entry);
    const report = { libraryId, name: entry.name, platform: entry.platform, host: hostFor(entry),
      startedAt: new Date().toISOString(), required, discovery: [], books: [] };
    const candidates = new Map(), seenTitles = new Set();
    const addRows = rows => { for (const row of rows) {
      const title = canonical(row.title);
      if (row.recordId && title && !seenTitles.has(title)) { candidates.set(String(row.recordId),row); seenTitles.add(title); }
    } };
    addRows(supplied);
    if (!provider?.searchCatalog || !provider?.resolveCatalogRecord) {
      return { ...report, finishedAt: new Date().toISOString(), verified: 0, status: 'unsupported', reason: 'Catalog search/record interface unavailable' };
    }
    for (const query of queries) {
      if (candidates.size >= maxAttempts) break;
      const result = await operation(entry, () => provider.searchCatalog(query), operationTimeoutMs);
      const rows = rowsOf(result.value);
      report.discovery.push({ query, ...result, value: undefined, records: rows.length });
      addRows(rows);
      onProgress({ libraryId, phase: 'discovery', query, ok: result.ok, records: rows.length });
      if (refused(result)) { report.refused = true; break; }
      if (!result.ok && result.code === 'CATALOG_UNSUPPORTED') break;
    }
    for (const row of [...candidates.values()].slice(0,maxAttempts)) {
      if (report.refused || verifiedBooks(report.books).length >= required) break;
      const query = String(row.title).replace(/\s*[/=:]\s*$/, '').trim().slice(0,200);
      const searched = await operation(entry, () => provider.searchCatalog(query), operationTimeoutMs);
      const matchingRecord = rowsOf(searched.value).some(hit => String(hit.recordId) === String(row.recordId));
      const book = { query, title: row.title, recordId: String(row.recordId),
        search: { ...searched, value: undefined, matchingRecord } };
      report.books.push(book);
      if (refused(searched)) { report.refused = true; break; }
      if (!matchingRecord) { onProgress({libraryId,phase:'book',recordId:book.recordId,ok:false,reason:'search'}); continue; }
      // readRecord owns the real operation context. Wrapping it in another
      // withCatalogOperation would replace its signal/cap with the diagnostic
      // search budget because nested operation contexts are deliberately shared.
      const resolveStarted = Date.now();
      let resolved;
      try { resolved = {ok:true,value:await lookup.readRecord({library:entry,recordId:book.recordId,read:()=>provider.resolveCatalogRecord(book.recordId)}),durationMs:Date.now()-resolveStarted}; }
      catch (error) { resolved = {...failure(error),durationMs:Date.now()-resolveStarted}; }
      const record = resolved.value;
      book.resolve = { ...resolved, value: undefined, ok: Boolean(resolved.ok && canonical(record?.title) === canonical(row.title) && String(record?.recordId) === book.recordId),
        title: record?.title, observation: record?.observation };
      if (refused(resolved)) { report.refused = true; break; }
      if (!book.resolve.ok) { onProgress({libraryId,phase:'book',recordId:book.recordId,ok:false,reason:'resolve'}); continue; }
      book.isbn13 = validateAndNormalize(record.isbn13 || record.isbn || '') || null;
      book.catalogUrl = record.observation?.catalogUrl || entry.catalogUrl;
      // A cold provider read under the app's own budget, never a stored answer.
      clearHttpCache();
      const identity = { bookKey: createCatalogBookKey(libraryId,book.recordId), recordId:book.recordId,
        recordLibraryId:libraryId,title:record.title,authors:record.authors || [],isbn13:book.isbn13 || undefined };
      book.lookup = await lookup.lookupBook({ library:entry, book:identity, storedChecked:true });
      if (refused(book.lookup)) { report.refused = true; break; }
      if (checkIsbn && book.isbn13) {
        clearHttpCache();
        book.isbnLookup = await lookup.lookupBook({ library:entry, book:{ bookKey:'v1:isbn:'+book.isbn13,
          isbn13:book.isbn13,title:record.title,authors:record.authors || [] }, editionScope:'exact', storedChecked:true });
        if (refused(book.isbnLookup)) { report.refused = true; break; }
      }
      onProgress({libraryId,phase:'book',recordId:book.recordId,title:book.title,outcome:book.lookup.outcome,verified:verifiedBooks(report.books).length});
    }
    report.verified = verifiedBooks(report.books).length;
    report.status = report.verified >= required ? 'passed' : report.verified ? 'partial' : 'failed';
    report.finishedAt = new Date().toISOString();
    return report;
  }
  return { probeLibrary };
}
