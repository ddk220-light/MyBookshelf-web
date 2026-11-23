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
const manifestPath = path.resolve(option('--manifest', fileURLToPath(new URL('./manifests/academic-wide.json', import.meta.url))));
const outputPath = option('--output');
if (!outputPath) throw Error('Usage: node tools/catalog-hardening/academic-wide-run.mjs --output report.json [--manifest manifest.json]');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!Array.isArray(manifest.libraries) || !manifest.libraries.length) throw Error('Manifest must list libraries');
if (new Set(manifest.libraries.map(l => l.libraryId)).size !== manifest.libraries.length) throw Error('Manifest repeats a library');
fs.mkdirSync(path.dirname(path.resolve(outputPath)), {
  recursive: true
});
const all = getAllLibraries();
for (const library of manifest.libraries) if (library.queries !== undefined && (!Array.isArray(library.queries) || !library.queries.length || library.queries.length > 6 || library.queries.some(q => typeof q !== 'string' || !q.trim() || q.length > 500))) throw Error('Queries must be 1..6 bounded titles or subjects');
const libraries = manifest.libraries.map(item => {
  const entry = all.find(l => l.id === item.libraryId);
  if (entry?.country !== 'IN' || !(entry.platform === 'discovery-academic' || entry.alternateCatalogs?.some(a => a.platform === 'discovery-academic'))) throw Error('Expected a connected Indian academic library: ' + item.libraryId);
  return entry;
});
const report = {
  schemaVersion: 1,
  selection: manifestPath,
  startedAt: new Date().toISOString(),
  method: 'One-book complete-attempt live title query, matching record, and cold app lookup with actual resolution observed inside lookup. Wider smoke test only, not ten-book qualification. One directory institution counted once; connected academic alternate routes use actual app routing. All nonacademic hosts blocked before network.',
  libraries: []
};
const save = () => {
  fs.writeFileSync(outputPath + '.tmp', JSON.stringify(report, null, 2) + '\n');
  fs.renameSync(outputPath + '.tmp', outputPath);
};
const hostGate = createMemoryHostGate(),
  basePolicy = createRobotsPolicy(),
  nextHostAt = new Map();
for (const entry of libraries) {
  const route = entry.alternateCatalogs?.find(a => a.platform === 'discovery-academic') || entry,
    host = new URL(route.baseUrl || route.catalogUrl).host;
  await new Promise(done => setTimeout(done, Math.max(0, (nextHostAt.get(host) || 0) - Date.now())));
  nextHostAt.set(host, Date.now() + 30000);
  const provider = getProvider(entry),
    robots = {
      check: u => new URL(u).host === host ? basePolicy.check(u) : Promise.resolve({
        allowed: false,
        delayMs: 0
      })
    };
  let active;
  const tracked = {
    ...provider,
    resolveCatalogRecord: async id => {
      const record = await provider.resolveCatalogRecord(id);
      if (active) active.resolve = {
        ok: record?.recordId === id,
        recordId: record?.recordId,
        title: record?.title,
        observation: record?.observation,
        observedDuring: 'app lookupBook'
      };
      return record;
    }
  };
  const lookup = createCatalogLookup({
      providerFor: l => l.id === entry.id ? tracked : getProvider(l),
      hostGate,
      robots
    }),
    r = {
      libraryId: entry.id,
      name: entry.name,
      route: route.academicCatalogId,
      allowedCatalogHost: host,
      startedAt: new Date().toISOString(),
      discovery: [],
      books: []
    };
  report.libraries.push(r);
  save();
  const op = task => withCatalogOperation({
    maxRequests: 6,
    robots: u => robots.check(u),
    gate: (h, o) => hostGate.reserve(h, {
      ...o,
      perMinute: 10
    })
  }, task);
  try {
    let candidates = [];
    for (const q of manifest.libraries.find(l => l.libraryId === entry.id).queries || ['India', 'history', 'science']) {
      clearHttpCache();
      try {
        candidates = await op(() => provider.searchCatalog(q));
        r.discovery.push({
          query: q,
          count: candidates.length
        });
        if (candidates.length) break;
      } catch (e) {
        r.discovery.push({
          query: q,
          code: e.code || e.name,
          message: e.message
        });
        if (e.code === 'CATALOG_PROVIDER_BLOCKED') break;
      }
    }
    for (const seed of candidates.slice(0, 2)) {
      const b = {
        title: seed.title,
        recordId: seed.recordId,
        startedAt: new Date().toISOString(),
        attemptId: entry.id + ':' + Date.now()
      };
      r.books.push(b);
      active = b;
      clearHttpCache();
      try {
        const rows = await op(() => provider.searchCatalog(seed.title.slice(0, 500))),
          hit = rows.find(x => x.recordId === seed.recordId);
        b.search = {
          query: seed.title.slice(0, 500),
          sameRecord: Boolean(hit),
          matchingRecord: Boolean(hit),
          matchedRecordId: hit?.recordId,
          count: rows.length
        };
        if (hit) {
          clearHttpCache();
          b.lookup = await lookup.lookupBook({
            library: entry,
            book: {
              bookKey: createCatalogBookKey(entry.id, seed.recordId),
              recordId: seed.recordId,
              recordLibraryId: entry.id,
              title: hit.title,
              authors: hit.authors || [],
              isbn13: hit.isbn || undefined
            },
            storedChecked: true
          });
        }
        b.pass = b.search.sameRecord && b.resolve?.ok && titleKey(b.resolve.title) === titleKey(b.title) && b.lookup?.outcome === 'found' && b.lookup.source === 'live';
      } catch (e) {
        b.error = {
          code: e.code || e.name,
          message: e.message
        };
      }
      active = null;
      save();
      if (b.pass) break;
    }
  } catch (e) {
    r.error = {
      code: e.code || e.name,
      message: e.message
    };
  }
  r.verified = r.books.filter(b => b.pass).length;
  r.status = r.verified ? 'passed' : 'failed';
  r.finishedAt = new Date().toISOString();
  save();
  console.log(entry.id, r.verified, r.books.at(-1)?.error?.code || r.discovery.at(-1)?.code || '');
}
report.finishedAt = new Date().toISOString();
report.verifiedLibraries = report.libraries.filter(l => l.verified >= 1).length;
save();
