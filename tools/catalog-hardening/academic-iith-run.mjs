import fs from 'node:fs';
import { getAllLibraries } from '../../server/services/directory.js';
import { createCatalogLookup } from '../../server/services/catalog-lookup/index.js';
import { clearHttpCache } from '../../server/services/providers/http.js';
import { validateAndNormalize } from '../../server/services/isbn.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const titleKey = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw Error('Missing ' + name + ' value');
  return args[index + 1];
}
const manifestPath = path.resolve(option('--manifest', fileURLToPath(new URL('./manifests/academic-iith.json', import.meta.url))));
const outputPath = option('--output');
if (!outputPath) throw Error('Usage: node tools/catalog-hardening/academic-iith-run.mjs --output report.json [--manifest manifest.json]');
const manifest = JSON.parse(fs.readFileSync(manifestPath));
if (manifest.libraryId !== 'koha:iit-hyderabad' || !Array.isArray(manifest.books) || !manifest.books.length || manifest.books.length > 10) throw Error('Expected 1..10 IIT Hyderabad ISBN records');
for (const book of manifest.books) if (!/^[1-9]\d{0,11}$/.test(book.recordId) || typeof book.title !== 'string' || !book.title.trim() || book.title.length > 500 || validateAndNormalize(book.isbn13) !== book.isbn13) throw Error('Invalid scoped ISBN candidate');
if (new Set(manifest.books.map(b => b.recordId)).size !== manifest.books.length) throw Error('Duplicate records');
fs.mkdirSync(path.dirname(path.resolve(outputPath)), {
  recursive: true
});
const lib = getAllLibraries().find(l => l.id === manifest.libraryId),
  prior = {
    books: manifest.books.map(b => ({
      ...b,
      pass: true
    }))
  };
const seeds = manifest.books.map(b => ({
  biblio_id: Number(b.recordId),
  title: b.title,
  isbn: b.isbn13
}));
const report = {
  libraryId: lib.id,
  name: lib.name,
  route: lib.publicCatalogApi,
  startedAt: new Date().toISOString(),
  method: 'Cold ISBN lookup through app default policy and robots, with actual public ISBN search and detail responses captured as identity evidence. Search/detail requests share the app budget; no catalog record shortcut.',
  books: []
};
const save = () => {
  fs.writeFileSync(outputPath + '.tmp', JSON.stringify({
    schemaVersion: 1,
    selection: manifestPath,
    libraries: [report]
  }, null, 2) + '\n');
  fs.renameSync(outputPath + '.tmp', outputPath);
};
const isbns = s => (String(s || '').match(/\b[0-9][0-9Xx -]{8,24}\b/g) || []).map(x => validateAndNormalize(x.trim())).filter(Boolean);
const raw = global.fetch;
let active;
global.fetch = async (u, o) => {
  const r = await raw(u, o);
  if (active && String(u).startsWith(lib.baseUrl + '/api/')) {
    let v;
    try {
      v = await r.clone().json();
    } catch {}
    if (String(u).endsWith('/api/search')) {
      const q = JSON.parse(o.body);
      active.searches.push({
        requestedIsbn: active.isbn13,
        query: q.query,
        type: q.type,
        queryIsbnMatches: validateAndNormalize(q.query) === active.isbn13,
        status: r.status,
        total: v?.total,
        books: v?.books?.map(b => ({
          recordId: String(b.biblio_id),
          title: b.title,
          isbn: b.isbn,
          ownsRequestedIsbn: isbns(b.isbn).includes(active.isbn13)
        }))
      });
    } else active.details.push({
      url: String(u),
      status: r.status,
      recordId: String(v?.biblio_id),
      title: v?.title,
      isbn: v?.isbn,
      ownsRequestedIsbn: isbns(v?.isbn).includes(active.isbn13),
      itemCount: v?.item_count
    });
  }
  return r;
};
const lookup = createCatalogLookup();
let next = 0;
for (const p of prior.books.filter(b => b.pass)) {
  await new Promise(r => setTimeout(r, Math.max(0, next - Date.now())));
  next = Date.now() + 10000;
  clearHttpCache();
  const expected = seeds.find(s => s.title === p.title && isbns(s.isbn).includes(p.isbn13));
  const b = {
    title: p.title,
    isbn13: p.isbn13,
    recordId: String(expected?.biblio_id),
    startedAt: new Date().toISOString(),
    searches: [],
    details: []
  };
  report.books.push(b);
  active = b;
  b.lookup = await lookup.lookupBook({
    library: lib,
    book: {
      bookKey: 'v1:isbn:' + b.isbn13,
      isbn13: b.isbn13,
      title: b.title,
      authors: p.authors
    },
    editionScope: 'exact',
    storedChecked: true
  });
  active = null;
  b.search = {
    sameIsbn: b.searches.some(s => s.queryIsbnMatches && s.books?.some(r => r.ownsRequestedIsbn)),
    matchingRecord: b.searches.some(s => s.books?.some(r => r.recordId === b.recordId && r.ownsRequestedIsbn && b.details.some(d => d.recordId === r.recordId && d.ownsRequestedIsbn)))
  };
  b.resolve = {
    ok: b.details.some(d => d.recordId === b.recordId && d.ownsRequestedIsbn) && b.details.every(d => d.ownsRequestedIsbn && b.searches.some(s => s.books?.some(r => r.recordId === d.recordId))),
    recordIds: b.details.map(d => d.recordId)
  };
  b.resolve.title = b.details.find(d => d.recordId === b.recordId)?.title;
  b.resolve.recordId = b.recordId;
  b.pass = b.search.sameIsbn && b.search.matchingRecord && b.resolve.ok && titleKey(b.resolve.title) === titleKey(b.title) && b.lookup.outcome === 'found' && b.lookup.evidence === 'exact_isbn' && b.lookup.source === 'live';
  save();
  console.log(report.books.length, b.pass, b.title, b.lookup.outcome);
}
report.verified = report.books.filter(b => b.pass).length;
report.finishedAt = new Date().toISOString();
save();
