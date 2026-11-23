import fs from 'node:fs';
import { getAllLibraries } from '../../server/services/directory.js';
import { getProvider } from '../../server/services/providers/index.js';
import { withCatalogOperation, clearHttpCache } from '../../server/services/providers/http.js';
import { createRobotsPolicy } from '../../server/services/providers/robots.js';
import { createMemoryHostGate } from '../../server/catalog-store/hostGate.js';
import { createCatalogLookup } from '../../server/services/catalog-lookup/index.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCatalogBookKey } from '../../server/public-v2/contracts.js';
const args = process.argv.slice(2);
const titleKey = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
function option(name, fallback) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw Error('Missing ' + name + ' value');
  return args[i + 1];
}
const manifestPath = path.resolve(option('--manifest', fileURLToPath(new URL('./manifests/academic-ten-books.json', import.meta.url))));
const outputPath = option('--output');
if (!outputPath) throw Error('Usage: node tools/catalog-hardening/academic-run.mjs --output report.json [--manifest manifest.json] [--concurrency 1..3]');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!Array.isArray(manifest.libraries) || !manifest.libraries.length) throw Error('Manifest must list libraries');
const concurrency = Number(option('--concurrency', '3'));
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) throw Error('Concurrency must be 1..3');
fs.mkdirSync(path.dirname(path.resolve(outputPath)), {
  recursive: true
});
const all = getAllLibraries(),
  gate = createMemoryHostGate(),
  policy = createRobotsPolicy();
const selected = manifest.libraries.map(l => l.libraryId);
if (new Set(selected).size !== selected.length) throw Error('Manifest repeats a library');
const hosts = selected.map(id => {
  const entry = all.find(l => l.id === id);
  const route = entry?.alternateCatalogs?.find(a => a.platform === 'discovery-academic') || entry;
  if (entry?.country !== 'IN' || route?.platform !== 'discovery-academic') throw Error('Expected a connected Indian academic library: ' + id);
  return new URL(route.baseUrl || route.catalogUrl).host;
});
if (concurrency > 1 && new Set(hosts).size !== hosts.length) throw Error('Shared origins require --concurrency 1');
for (const library of manifest.libraries) if (!Array.isArray(library.candidates) || !library.candidates.length || library.candidates.length > 10) throw Error('Provide 1..10 known candidates per library');
for (const library of manifest.libraries) {
  const ids = new Set(),
    titles = new Set();
  for (const book of library.candidates) {
    if (typeof book.title !== 'string' || !book.title.trim() || book.title.length > 500 || typeof book.recordId !== 'string') throw Error('Each candidate needs a bounded title and record ID');
    createCatalogBookKey(library.libraryId, book.recordId);
    const title = book.title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
    if (ids.has(book.recordId) || titles.has(title)) throw Error('Candidates must be distinct records and titles');
    ids.add(book.recordId);
    titles.add(title);
  }
}
const report = {
  schemaVersion: 1,
  selection: manifestPath,
  startedAt: new Date().toISOString(),
  method: 'Complete single-attempt evidence: live own-title query returns requested record; cold app lookup resolves that same record through actual directory entry/provider routing. Resolution is observed inside the real lookup to avoid an extra duplicate request. Production budgets, robots, host caps; bulk pacing outside lookup deadline. No cross-attempt OR joining.',
  libraries: []
};
const save = () => {
  fs.writeFileSync(outputPath + '.tmp', JSON.stringify(report, null, 2) + '\n');
  fs.renameSync(outputPath + '.tmp', outputPath);
};
let next = 0;
await Promise.all(Array.from({
  length: concurrency
}, async () => {
  while (next < selected.length) {
    const id = selected[next++],
      entry = all.find(l => l.id === id),
      alt = entry.alternateCatalogs?.find(a => a.platform === 'discovery-academic'),
      route = alt || entry,
      allowedHost = new URL(route.baseUrl || route.catalogUrl).host,
      provider = getProvider(entry);
    let active;
    const robots = {
      check: u => new URL(u).host === allowedHost ? policy.check(u) : Promise.resolve({
        allowed: false,
        delayMs: 0
      })
    };
    const tracked = {
      ...provider,
      resolveCatalogRecord: async recordId => {
        const start = Date.now();
        const value = await provider.resolveCatalogRecord(recordId);
        if (active) active.resolve = {
          ok: value?.recordId === recordId,
          requestedRecordId: recordId,
          recordId: value?.recordId,
          title: value?.title,
          observation: value?.observation,
          durationMs: Date.now() - start,
          observedDuring: 'app lookupBook'
        };
        return value;
      }
    };
    const lookup = createCatalogLookup({
      providerFor: l => l.id === id ? tracked : getProvider(l),
      robots,
      hostGate: gate
    });
    const r = {
      libraryId: id,
      name: entry.name,
      route: route.academicCatalogId,
      primaryPlatform: entry.platform,
      allowedCatalogHost: allowedHost,
      books: []
    };
    report.libraries.push(r);
    save();
    let at = 0;
    for (const seed of manifest.libraries.find(l => l.libraryId === id).candidates) {
      let success = false;
      for (let attempt = 1; attempt <= 2 && !success; attempt++) {
        await new Promise(done => setTimeout(done, Math.max(0, at - Date.now())));
        at = Date.now() + (alt ? 60000 : 30000);
        clearHttpCache();
        const recordId = seed.recordId;
        const b = {
          title: seed.title,
          recordId,
          startedAt: new Date().toISOString(),
          attemptId: id + ':' + recordId + ':' + Date.now(),
          attempt
        };
        r.books.push(b);
        active = b;
        try {
          const start = Date.now();
          const hits = await withCatalogOperation({
            maxRequests: 6,
            robots: u => robots.check(u),
            gate: (h, o) => gate.reserve(h, {
              ...o,
              perMinute: 10
            })
          }, () => provider.searchCatalog(seed.title.slice(0, 500)));
          const hit = hits.find(h => h.recordId === recordId);
          b.search = {
            query: seed.title.slice(0, 500),
            sameRecord: Boolean(hit),
            matchingRecord: Boolean(hit),
            matchedRecordId: hit?.recordId,
            matchedTitle: hit?.title,
            count: hits.length,
            durationMs: Date.now() - start
          };
          if (!hit) throw Object.assign(Error('Own-title query did not return requested record'), {
            code: 'RECORD_REPLAY_MISSING'
          });
          clearHttpCache();
          b.lookup = await lookup.lookupBook({
            library: entry,
            book: {
              bookKey: createCatalogBookKey(id, recordId),
              recordId,
              recordLibraryId: id,
              title: hit.title,
              authors: hit.authors || [],
              isbn13: hit.isbn || undefined
            },
            storedChecked: true
          });
          success = b.search.sameRecord && b.resolve?.ok && titleKey(b.resolve.title) === titleKey(b.title) && b.lookup.outcome === 'found' && b.lookup.source === 'live';
          b.pass = success;
        } catch (e) {
          b.error = {
            code: e.code || e.name,
            message: e.message
          };
        }
        active = null;
        save();
        console.log(id, r.books.filter(b => b.pass).length, b.pass, b.title, b.lookup?.outcome || b.error?.code);
        if (!success) at = Math.max(at, (Math.floor(Date.now() / 60000) + 1) * 60000);
      }
    }
    r.verified = r.books.filter(b => b.pass).length;
    r.finishedAt = new Date().toISOString();
    save();
  }
}));
report.finishedAt = new Date().toISOString();
save();
