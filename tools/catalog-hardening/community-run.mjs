import fs from 'node:fs';
import { getLibraryById } from '../../server/services/directory.js';
import { getProvider } from '../../server/services/providers/index.js';
import { withCatalogOperation, clearHttpCache } from '../../server/services/providers/http.js';
import { createRobotsPolicy } from '../../server/services/providers/robots.js';
import { createMemoryHostGate } from '../../server/catalog-store/hostGate.js';
import { createCatalogLookup } from '../../server/services/catalog-lookup/index.js';
import { createCatalogBookKey } from '../../server/public-v2/contracts.js';
import { parseReplayId, normalized } from '../../server/services/providers/communityRecords.js';

// Run after sourcing the workspace network/Node environment. Independent hosts
// may run together; each host has one stream and production robots/host limits.
// --smoke checks one member of each other community family, outside the cohort.
// --wide uses the frozen remaining-entry manifest, serialized by shared host.
// --wide --manifest file --output file reruns a later bounded manifest into
// its own result file, leaving the original wide evidence unchanged.
const argValue = name => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : null; };
const wide = process.argv.includes('--wide');
const manifestPath = argValue('--manifest'), outputPath = argValue('--output');
if (Boolean(manifestPath) !== Boolean(outputPath) || (manifestPath && !wide)) throw new Error('Use --wide --manifest file --output file together');
const manifest = wide ? JSON.parse(fs.readFileSync(manifestPath || new URL('./manifests/community-wide.json', import.meta.url), 'utf8')) : null;
const smoke = wide || process.argv.includes('--smoke');
const required = smoke ? 1 : 10;
const ids = wide ? manifest.libraries.map(item => item.libraryId) : smoke ? [
  'discovery-community:nmmc-l01',
  'discovery-community:pmb-afindia-10',
  'discovery-community:rmc-1',
  'discovery-community:santhom-kottayam',
  'discovery-community:shodhak-rajkot',
  'discovery-community:sindhi-sanchaya-indian-institute-of-sindhology',
] : ['discovery-community:rmrl-chennai', 'discovery-community:surat-1'];
const file = outputPath ? new URL(outputPath, `file://${process.cwd()}/`)
  : new URL(`../../docs/research/india-library-hardening/community-${wide ? 'wide-' : smoke ? 'smoke-' : ''}results.json`, import.meta.url);
const reports = {
  observedOn: new Date().toISOString().slice(0, 10),
  cohort: wide ? 'remaining community directory entries; not the frozen 50' : smoke ? 'wider community family smoke; not the frozen 50' : 'frozen 50 community members',
  ...(wide ? { manifest: manifestPath || 'tools/catalog-hardening/manifests/community-wide.json', plannedEntries: ids.length, stoppedHosts: [] } : {}),
  method: 'One sequential stream per host; production robots policy and host gate; at least 7-second diagnostic pacing, with production pacing for cold app lookup. Each book is rediscovered by its own title, source identity and exact normalized title confirmed, resolved, then read cold through createCatalogLookup. Replay IDs embed the query, so their explicit source ID is compared across queries.',
  libraries: [],
};
const save = () => fs.writeFileSync(file, JSON.stringify(reports, null, 2) + '\n');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const sourceId = id => id.startsWith('r1_') ? parseReplayId(id).sourceId : id;
const failure = error => ({ ok: false, code: error?.code || error?.name || 'ERROR', message: String(error?.message || error).slice(0, 350) });
const robots = createRobotsPolicy(), hostGate = createMemoryHostGate();
const lookup = createCatalogLookup({ robots, hostGate });
const stoppedHosts = new Set();
function stopHost(host, evidence) {
  if (!stoppedHosts.has(host)) reports.stoppedHosts?.push({ host, observedAt: new Date().toISOString(), evidence });
  stoppedHosts.add(host);
}

function countVerified(books) {
  const sourceIds = new Set(), titles = new Set();
  return books.filter(book => {
    const title = normalized(book.title);
    if (!book.verified || book.eligibleBook === false || book.countedForBookRequirement === false || sourceIds.has(book.sourceRecordId) || titles.has(title)) return false;
    sourceIds.add(book.sourceRecordId);
    titles.add(title);
    return true;
  }).length;
}

async function operation(task) {
  const started = Date.now(), controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    return await withCatalogOperation({
      maxRequests: 12,
      signal: controller.signal,
      robots: url => robots.check(url),
      gate: (host, options) => hostGate.reserve(host, { ...options, perMinute: 10, spacingMs: Math.max(7000, options.spacingMs || 0) }),
    }, async op => ({ ok: true, value: await task(), requests: op.requests, durationMs: Date.now() - started }));
  } catch (error) {
    return { ...failure(error), durationMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

async function run(libraryId) {
  const library = getLibraryById(libraryId), provider = getProvider(library);
  const host = new URL(library.baseUrl).host;
  const report = {
    libraryId, name: library.name, host, family: library.communityCatalog.family,
    scope: library.communityCatalog.scope || null, catalogUrl: library.catalogUrl,
    startedAt: new Date().toISOString(), required, discovery: [], books: [], verified: 0,
  };
  reports.libraries.push(report);
  save();
  const seenTitles = new Set(), candidates = [];
  const seeds = manifest?.libraries.find(item => item.libraryId === libraryId)?.queries
    || (library.communityCatalog.family === 'surat' ? ['History', 'Science', 'India']
    : library.communityCatalog.family === 'pmb' ? ['histoire', 'India']
    : library.communityCatalog.family === 'sindhi' ? ['Sindh', 'India'] : ['India', 'History', 'Tamil', 'Science']);
  for (const query of seeds) {
    if (candidates.length >= (smoke ? 1 : 18)) break;
    const found = await operation(() => provider.searchCatalog(query));
    const rows = found.value || [];
    report.discovery.push({ ...found, value: undefined, query, records: rows.length });
    console.log(JSON.stringify({ libraryId, phase: 'discovery', ...report.discovery.at(-1) }));
    save();
    for (const row of rows) {
      const title = normalized(row.title);
      if (!seenTitles.has(title)) { seenTitles.add(title); candidates.push(row); }
    }
    if (!found.ok && found.code === 'CATALOG_PROVIDER_BLOCKED') stopHost(host, found);
    if (!found.ok && ['CATALOG_PROVIDER_BLOCKED', 'CATALOG_UNSUPPORTED', 'CATALOG_UNAVAILABLE'].includes(found.code)) break;
    await pause(7000);
  }
  for (const seed of candidates.slice(0, smoke ? 5 : 22)) {
    if (report.verified >= required || stoppedHosts.has(host)) break;
    const query = seed.title.replace(/\s*[/=:]\s*$/, '').trim().slice(0, 200);
    const searched = await operation(() => provider.searchCatalog(query));
    if (!searched.ok && searched.code === 'CATALOG_PROVIDER_BLOCKED') stopHost(host, searched);
    // Never join by a similar title: require the catalog's own source ID and
    // the same normalized title, then use the newly returned replay ID.
    const match = (searched.value || []).find(row => sourceId(row.recordId) === sourceId(seed.recordId)
      && normalized(row.title) === normalized(seed.title));
    const book = {
      query, title: seed.title, eligibleBook: true, seedRecordId: seed.recordId, sourceRecordId: sourceId(seed.recordId),
      discoverySourceId: sourceId(seed.recordId), queriedSourceId: match ? sourceId(match.recordId) : null,
      returnedRecordId: match?.recordId || null, recordId: match?.recordId || null,
      search: { ...searched, value: undefined, matchingRecord: !!match, matchingSourceId: !!match, matchingExactTitle: !!match },
    };
    report.books.push(book);
    save();
    if (!match) {
      console.log(JSON.stringify({ libraryId, phase: 'book', title: seed.title, ok: false, reason: 'search', search: book.search }));
      await pause(7000);
      continue;
    }
    await pause(7000);
    const resolved = await operation(() => provider.resolveCatalogRecord(match.recordId));
    if (!resolved.ok && resolved.code === 'CATALOG_PROVIDER_BLOCKED') stopHost(host, resolved);
    const record = resolved.value;
    book.resolve = {
      ...resolved, value: undefined,
      ok: !!(resolved.ok && record?.recordId === match.recordId && normalized(record.title) === normalized(match.title)),
      title: record?.title, observation: record?.observation,
    };
    save();
    if (!book.resolve.ok) {
      console.log(JSON.stringify({ libraryId, phase: 'book', title: seed.title, ok: false, reason: 'resolve', resolve: book.resolve }));
      await pause(7000);
      continue;
    }
    await pause(7000);
    clearHttpCache();
    book.lookup = await lookup.lookupBook({ library, book: {
      bookKey: createCatalogBookKey(libraryId, match.recordId), recordId: match.recordId,
      recordLibraryId: libraryId, title: record.title, authors: record.authors || [],
    }, storedChecked: true });
    if (book.lookup?.reason === 'blocked') stopHost(host, book.lookup);
    book.verified = book.search.matchingRecord && book.resolve.ok
      && book.lookup?.outcome === 'found' && book.lookup?.source === 'live';
    report.verified = countVerified(report.books);
    console.log(JSON.stringify({ libraryId, phase: 'book', title: seed.title,
      outcome: book.lookup?.outcome, source: book.lookup?.source, verified: report.verified }));
    save();
    await pause(7000);
  }
  report.status = report.verified >= required ? 'passed' : stoppedHosts.has(host) ? 'blocked'
    : report.discovery.every(item => item.ok && item.records === 0) ? 'empty-seed-searches'
      : report.verified ? 'partial' : 'inconclusive';
  report.finishedAt = new Date().toISOString();
  save();
  return report;
}

const hosts = new Map();
for (const id of ids) {
  const host = new URL(getLibraryById(id).baseUrl).host;
  if (!hosts.has(host)) hosts.set(host, []);
  hosts.get(host).push(id);
}
await Promise.all([...hosts].map(async ([host, members]) => {
  for (const id of members) {
    if (stoppedHosts.has(host)) {
      // Keep unattempted routes outside libraries[], which the summary counts
      // as checked entries. A refusal never becomes claimed coverage.
      reports.skippedEntries ||= [];
      reports.skippedEntries.push({ libraryId: id, host, reason: 'shared-host-refusal', attempted: false });
      save();
      continue;
    }
    await run(id);
  }
}));
reports.finishedAt = new Date().toISOString();
save();
