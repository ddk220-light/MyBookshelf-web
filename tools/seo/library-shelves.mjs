// The library shelf checker: for Indian libraries, which books of a pool the
// library's catalog has, using the app's own book check (the lookup the book
// page uses: one any-field catalog search and the 80% title matcher,
// server/services/libraryBookSearch.js, as tools/diag-check.mjs runs it).
// The public library and book pages (tools/seo/build-pages.mjs) read the
// result, shared/seo-shelves.json. Needs no database, server or secret.
//
//   node tools/seo/library-shelves.mjs candidates
//       Choose the candidate libraries -> shared/seo-shelf-candidates.json
//   node tools/seo/library-shelves.mjs pool [--file shared/us-book-pool.json] [--covers]
//       Fill missing Open Library work keys and ISBNs in shared/seo-book-pool.json
//       (or the file named), and with --covers the work's cover ID
//   node tools/seo/library-shelves.mjs run [--ids a,b] [--limit N] [--gap 30] [--log DIR] [--refresh-before YYYY-MM-DD]
//       Ask candidate libraries pool books until 10 are found or the pool is
//       used up. Resumable: stop it at any time and run it again.
//   node tools/seo/library-shelves.mjs details
//       Fetch Open Library details for found books that have none yet.
//   node tools/seo/library-shelves.mjs status
//       Libraries done, in progress and publishable.
//
// Gentle by construction: one request at a time per catalog host with a fixed
// gap (--gap seconds, default 30) after each check, hosts in parallel; the
// app's robots.txt policy, host gate and access restrictions apply to every
// request. Any blocking sign (robots refusal, access challenge, login) or four
// failures in a row skips a host for the rest of the day; three in a row skip
// a library for the day. A failed check is recorded as couldn't check, never
// as not found, and is asked again only on a later day.
import { readFile, writeFile, rename, mkdir, appendFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import {
  chooseCandidates, askOrder, nextBook, recordCheck, createFailurePolicy, createHostQueue, serializeShelves, emptyShelves,
  foundCounts, foundBooks, today, uniqueSlug, bookSlug, correctBookSlugs, shortDescription, choosePoolWork, MIN_SHELF, SHELF_SIZE, PLATFORM_CAPS,
} from './shelves-core.mjs';
import { storesAvailability } from '../../server/catalog-store/policy.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const FILES = {
  pool: resolve(root, 'shared/seo-book-pool.json'),
  candidates: resolve(root, 'shared/seo-shelf-candidates.json'),
  shelves: resolve(root, 'shared/seo-shelves.json'),
  manifest: resolve(root, 'shared/seo-libraries.json'),
  listed: resolve(root, 'server/data/india-catalogs-listed.json'),
  phoneTest: resolve(root, 'docs/research/2026-11-library-check-fixes/pixel-results-one-search.csv'),
};
const USER_AGENT = 'MyBookshelf/1.0 (web; +https://mybookshelf.cloud/privacy)';
const readJson = async (path, fallback) => { try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (fallback !== undefined && error.code === 'ENOENT') return fallback; throw error; } };
async function writeAtomic(path, text) { await writeFile(path + '.tmp', text); await rename(path + '.tmp', path); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    else out._.push(argv[i]);
  }
  return out;
}

// Libraries that answered (found or not found) in the 54-library phone test.
export function answeredInPhoneTest(csv) {
  const answered = new Set();
  for (const line of String(csv).trim().split('\n').slice(1)) {
    const cells = line.match(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)?.map(cell => cell.replace(/,$/, '')) || [];
    if (['found', 'not_found'].includes(cells[7])) answered.add(cells[1]);
  }
  return [...answered].sort();
}

async function candidates() {
  const { getAllLibraries } = await import('../../server/services/directory.js');
  const { hostFor } = await import('../../server/services/catalog-lookup/platforms.js');
  const listed = await readJson(FILES.listed);
  const answered = answeredInPhoneTest(await readFile(FILES.phoneTest, 'utf8'));
  const chosen = chooseCandidates(getAllLibraries(), { listedIds: listed.libraryIds, removed: (listed.removed || []).map(item => item.id), answered, hostOf: hostFor });
  const count = key => Object.fromEntries(Object.entries(Object.groupBy(chosen, row => row[key] || 'unknown')).map(([k, v]) => [k, v.length]).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));
  const file = {
    about: 'Candidate libraries for the public library pages, chosen by `node tools/seo/library-shelves.mjs candidates` from server/data/india-catalogs-listed.json (not removed, public availability) and the directory: libraries that answered in the 54-library phone test first, then by how well known the name says the library is (state central and large public libraries, national institutes, central universities, universities, colleges, schools), with caps per catalog system, per state and per small shared host. A page is published only for a library with at least five found books. Regenerate to change; the checker reads this list in order.',
    rules: { platformCaps: PLATFORM_CAPS, stateCap: 12, hostCap: 4, excluded: 'Darshan University, Karnataka Samskrit University, LBSNAA, C.E.S. College Goa (owner, 21 November 2026)' },
    count: chosen.length, byPlatform: count('platform'), byState: count('state'), libraries: chosen,
  };
  await writeAtomic(FILES.candidates, JSON.stringify(file, null, 2) + '\n');
  console.log(`${chosen.length} candidates`, file.byPlatform);
}

async function olSearch(params) {
  const url = 'https://openlibrary.org/search.json?' + new URLSearchParams({ ...params,
    fields: 'key,title,subtitle,author_name,first_publish_year,edition_count,readinglog_count,isbn,cover_i' });
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw Error('Open Library search ' + response.status);
  return (await response.json()).docs || [];
}
const isbn13s = list => [...new Set((list || []).filter(v => /^97[89]\d{10}$/.test(v)))].sort();
const workKey = doc => `v1:openlibrary:${String(doc.key).replace('/works/', '')}`;

// `--file` names another pool (shared/us-book-pool.json); `--covers` also
// fills `coverId`, the work's cover from the same search.
async function pool(options = {}) {
  const file = options.file ? resolve(root, String(options.file)) : FILES.pool;
  const covers = Boolean(options.covers);
  const data = await readJson(file);
  for (const book of data.books) {
    if (book.bookKey && book.isbn && (!covers || book.coverId)) continue;
    await sleep(1500);
    try {
      let doc;
      if (book.bookKey) doc = (await olSearch({ q: `key:/works/${book.bookKey.split(':').pop()}` }))[0];
      else {
        // Of the works titled (or subtitled) as the pool says, the most read,
        // then the one with most editions (choosePoolWork, shelves-core.mjs).
        doc = choosePoolWork(await olSearch({ title: book.title, author: book.author, limit: '20' }), book.title);
      }
      if (!doc) { console.log('not found on Open Library:', book.title); continue; }
      book.bookKey ||= workKey(doc);
      const isbn = isbn13s(doc.isbn)[0];
      if (isbn) book.isbn = isbn;
      if (covers && /^\d+$/.test(String(doc.cover_i || ''))) book.coverId = String(doc.cover_i);
      console.log(book.bookKey, '|', doc.title, '|', (doc.author_name || []).join('; '), '|', doc.edition_count, '|', book.isbn || '', '|', book.coverId || '');
    } catch (error) { console.log('failed:', book.title, error.message); }
  }
  const keys = data.books.map(b => b.bookKey).filter(Boolean);
  if (new Set(keys).size !== keys.length) console.log('Warning: duplicate work keys in the pool');
  // One book per line, as the file is kept by hand; other top-level fields
  // (the US list's `updatedOn`) are kept between "about" and "books".
  const line = book => '    { ' + Object.entries(book).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ') + ' }';
  const { about, books, ...rest } = data;
  const extra = Object.entries(rest).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},\n`).join('');
  await writeAtomic(file, `{\n  "about": ${JSON.stringify(about)},\n${extra}  "books": [\n${books.map(line).join(',\n')}\n  ]\n}\n`);
}

// Book details from the app's own resolver (Open Library), plus its ISBNs.
async function bookDetails(books, bookKey, taken) {
  const resolved = await books.resolve(bookKey);
  if (!resolved?.title) throw Error('no details');
  await sleep(1000);
  const doc = (await olSearch({ q: `key:/works/${bookKey.split(':').pop()}` }))[0] || {};
  const authors = (resolved.authors || []).slice(0, 4);
  const cover = /^https:\/\/covers\.openlibrary\.org\/b\/id\/(\d+)-[SML]\.jpg$/.exec(resolved.coverUrl || '')?.[1] || (doc.cover_i ? String(doc.cover_i) : null);
  // Whitespace and a trailing full stop are tidied; the words are Open Library's.
  const title = resolved.title.replace(/\s+/g, ' ').trim().replace(/(\w{2})\.$/, '$1');
  const details = {
    slug: bookSlug({ bookKey, title, authors }, taken), title, authors,
    openLibraryUrl: `https://openlibrary.org/works/${bookKey.split(':').pop()}`, fetchedOn: today(),
  };
  const year = /^\d{4}$/.test(String(doc.first_publish_year || '')) ? Number(doc.first_publish_year) : null;
  // Kept for reference only; the pages do not show it: Open Library's
  // first_publish_year is its earliest listed edition, often a later reprint.
  if (year) details.firstPublished = year;
  const description = shortDescription(resolved.description);
  if (description) details.description = description;
  if (cover) details.coverId = cover;
  const isbns = isbn13s(doc.isbn).slice(0, 4);
  if (isbns.length) details.isbns = isbns;
  // Open Library subjects are left out: they mix languages and include
  // unrelated headings, so they are not tidy enough to publish.
  return details;
}

async function services() {
  process.env.CATALOG_LOOKUP_V2 ||= 'all';
  const { createPublicDirectoryService } = await import('../../server/public-v2/directory.js');
  const { createPublicBookService } = await import('../../server/public-v2/metadata.js');
  const { createPublicCatalogBookService } = await import('../../server/public-v2/catalogBooks.js');
  const { createCatalogLookup, createLookupRecorder, createMemoryHealthRecord, hostFor } = await import('../../server/services/catalog-lookup/index.js');
  const directory = createPublicDirectoryService();
  const books = createPublicBookService({ catalogs: createPublicCatalogBookService({ directory }) });
  // As tools/diag-check.mjs: no store, and no log line to the platform log.
  const recorder = createLookupRecorder({ health: createMemoryHealthRecord(), telemetry: { emit() {} }, defer: fn => { fn(); }, log: () => {} });
  const lookup = createCatalogLookup({ recorder });
  return { directory, books, lookup, hostFor };
}

async function details(given) {
  const { books } = given || await services();
  const data = await readJson(FILES.shelves, emptyShelves());
  correctBookSlugs(data.books);
  const taken = new Set(Object.values(data.books).map(b => b.slug));
  for (const key of [...foundCounts(data).keys()].sort()) {
    if (data.books[key]) continue;
    try { data.books[key] = await bookDetails(books, key, taken); taken.add(data.books[key].slug); console.log('details', key, data.books[key].slug); }
    catch (error) { console.log('details failed', key, error.message); }
  }
  await writeAtomic(FILES.shelves, serializeShelves(data));
}

async function run(options) {
  const gapMs = Math.max(20, Number(options.gap || 30)) * 1000;
  const logDir = options.log ? resolve(String(options.log).replace(/^~/, homedir())) : null;
  if (logDir) await mkdir(logDir, { recursive: true });
  const log = async (event) => {
    const line = JSON.stringify({ at: new Date().toISOString(), ...event });
    console.log(line);
    if (logDir) await appendFile(resolve(logDir, 'checks.jsonl'), line + '\n');
  };
  const { directory, books, lookup, hostFor } = await services();
  const poolBooks = (await readJson(FILES.pool)).books.filter(b => b.bookKey);
  const candidateRows = (await readJson(FILES.candidates)).libraries;
  const manifest = await readJson(FILES.manifest);
  const data = await readJson(FILES.shelves, emptyShelves());
  // Slugs an earlier surname rule gave (shelves-core correctBookSlugs) are
  // corrected here, so the next save writes them; the builder does the same.
  correctBookSlugs(data.books);
  const on = today();
  // Hosts skipped today by an earlier run (blocking sign or repeated failures).
  const statePath = logDir && resolve(logDir, 'hosts-skipped.json');
  const skippedState = statePath ? await readJson(statePath, {}) : {};
  const policy = createFailurePolicy();
  for (const [host, value] of Object.entries(skippedState)) if (value.on === on) policy.skipHost(host, value.reason);

  let chosen = candidateRows;
  if (options.ids) { const ids = String(options.ids).split(','); chosen = ids.map(id => candidateRows.find(r => r.id === id) || { id, kind: null }); }
  else if (options.limit) chosen = candidateRows.slice(0, Number(options.limit));
  if (options.skip) { const skip = new Set(String(options.skip).split(',')); chosen = chosen.filter(r => !skip.has(r.id)); }

  // Stable page slugs: the guide's own slug, else a new unique one kept forever.
  const taken = new Set([...manifest.map(m => m.slug), ...Object.values(data.libraries).map(l => l.slug).filter(Boolean)]);
  let saving = Promise.resolve();
  const save = () => (saving = saving.then(() => writeAtomic(FILES.shelves, serializeShelves(data))));
  const titles = new Map();
  const titleOf = async key => {
    if (!titles.has(key)) titles.set(key, books.resolve(key).then(r => r?.title ? r : null).catch(() => null));
    return titles.get(key);
  };
  const work = [];
  for (const row of chosen) {
    const entry = directory.entry?.(row.id), library = directory.resolve(row.id);
    if (!entry || !library) { await log({ libraryId: row.id, skipped: 'not in directory' }); continue; }
    if (!library.capabilities?.publicAvailability) { await log({ libraryId: row.id, skipped: 'no public availability check' }); continue; }
    // A catalog whose terms forbid storing availability (BiblioCommons,
    // server/data/catalog-policies.json) is never pre-checked for a shelf.
    if (!storesAvailability(row.id)) { await log({ libraryId: row.id, skipped: 'catalog policy forbids storing availability' }); continue; }
    const guide = manifest.find(m => m.id === row.id);
    data.libraries[row.id] ||= { checks: {} };
    const record = data.libraries[row.id];
    if (guide) record.slug = guide.slug;
    if (!record.slug) { record.slug = uniqueSlug([entry.name, entry.city || entry.district || '', entry.region || ''], row.id, taken); taken.add(record.slug); }
    record.kind = row.kind || record.kind || 'public';
    work.push({ row, entry, library, host: hostFor(entry), record });
  }
  await save();
  const queue = createHostQueue({ gapMs });
  const byHost = Map.groupBy(work, item => item.host);
  await log({ start: true, libraries: work.length, hosts: byHost.size, gapSeconds: gapMs / 1000, pool: poolBooks.length });
  const stopAt = options.hours ? Date.now() + Number(options.hours) * 3600_000 : Infinity;
  const detailQueue = createHostQueue({ gapMs: 1500 });
  const bookTaken = new Set(Object.values(data.books).map(b => b.slug));

  async function oneLibrary({ row, entry, library, host, record }) {
    const order = askOrder(poolBooks, record.kind);
    const skip = new Set();
    for (;;) {
      if (Date.now() > stopAt) return 'time';
      if (policy.hostSkipped(host)) return 'host skipped';
      if (policy.librarySkipped(row.id)) return 'library skipped';
      const book = nextBook(record, order, { foundElsewhere: foundCounts(data), on, refreshBefore: options['refresh-before'] || null, skip });
      if (!book) return foundBooks(record).length >= SHELF_SIZE ? 'done: 10 found' : 'done: pool asked';
      const resolved = await titleOf(book.bookKey);
      if (!resolved) { skip.add(book.bookKey); await log({ libraryId: row.id, bookKey: book.bookKey, skipped: 'book details unavailable (not a catalog failure)' }); continue; }
      const answer = await queue.run(host, async () => {
        if (policy.hostSkipped(host)) return null;
        lookup.prepare?.(entry);
        const t = Date.now();
        const bookArg = { bookKey: book.bookKey, title: resolved.title, authors: resolved.authors || [] };
        if (resolved.isbn13) bookArg.isbn13 = resolved.isbn13;
        if (resolved.workId) bookArg.workId = resolved.workId;
        try {
          const a = await lookup.lookupBook({ library: entry, publicLibrary: library, book: bookArg, books, editionScope: 'work', storedChecked: true, background: false,
            askedAt: t, deadlineAt: t + 60_000, finishBy: t + 110_000 });
          return { ...a, ms: Date.now() - t };
        } catch (error) { return { outcome: 'couldnt_check', reason: 'unavailable', errorCode: error.code || error.name, ms: Date.now() - t }; }
      });
      if (!answer) return 'host skipped';
      record.checks[book.bookKey] = recordCheck(record.checks[book.bookKey], answer, on);
      skip.add(book.bookKey);
      const verdict = policy.note(host, row.id, answer);
      await log({ libraryId: row.id, host, bookKey: book.bookKey, outcome: answer.outcome, reason: answer.reason || null, errorCode: answer.errorCode || null,
        matches: answer.matches?.length || 0, ms: answer.ms, found: foundBooks(record).length, ...(verdict ? { skipped: verdict } : {}) });
      if (verdict === 'host' && statePath) {
        skippedState[host] = { on, reason: policy.hostSkipped(host) };
        await writeAtomic(statePath, JSON.stringify(skippedState, null, 2) + '\n');
      }
      if (answer.outcome === 'found' && !data.books[book.bookKey]) {
        await detailQueue.run('openlibrary.org', async () => {
          if (data.books[book.bookKey]) return;
          try { data.books[book.bookKey] = await bookDetails(books, book.bookKey, bookTaken); bookTaken.add(data.books[book.bookKey].slug); }
          catch (error) { await log({ bookKey: book.bookKey, detailsFailed: error.message }); }
        });
      }
      await save();
    }
  }
  await Promise.all([...byHost.values()].map(async items => {
    for (const item of items) {
      const why = await oneLibrary(item);
      await log({ libraryId: item.row.id, finished: why, found: foundBooks(item.record).length, publishable: foundBooks(item.record).length >= MIN_SHELF });
    }
  }));
  await save();
  await log({ end: true, skippedHosts: policy.skippedHosts() });
}

async function status() {
  const data = await readJson(FILES.shelves, emptyShelves());
  const candidates = (await readJson(FILES.candidates)).libraries;
  const poolSize = (await readJson(FILES.pool)).books.filter(b => b.bookKey).length;
  let publishable = 0, done = 0, started = 0;
  const rows = [];
  for (const row of candidates) {
    const record = data.libraries[row.id];
    if (!record) continue;
    started += 1;
    const checks = Object.values(record.checks), found = foundBooks(record).length;
    const answered = checks.filter(c => c.outcome !== 'couldnt_check').length;
    const failed = checks.filter(c => c.outcome === 'couldnt_check').length;
    if (found >= MIN_SHELF) publishable += 1;
    if (found >= SHELF_SIZE || answered >= poolSize) done += 1;
    rows.push(`${row.id.padEnd(60)} ${row.platform.padEnd(20)} found ${String(found).padStart(2)}  answered ${String(answered).padStart(2)}  couldn't check ${failed}`);
  }
  console.log(rows.join('\n'));
  console.log(`\n${candidates.length} candidates, ${started} started, ${done} done, ${publishable} with ${MIN_SHELF}+ books (publishable), ${Object.keys(data.books).length} book details.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = args(process.argv.slice(2));
  const command = options._[0];
  const commands = { candidates, pool: () => pool(options), run: () => run(options), details: () => details(), status };
  if (!commands[command]) { console.error('Usage: node tools/seo/library-shelves.mjs candidates|pool|run|details|status'); process.exit(2); }
  await commands[command]();
  process.exit(0);
}
