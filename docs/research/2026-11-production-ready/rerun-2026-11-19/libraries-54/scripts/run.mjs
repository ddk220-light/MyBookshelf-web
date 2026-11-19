// 54 Indian libraries x 10 books through the app's own check, POST /api/v2/holdings/check.
// One worker per catalog host; the pause after each check keeps this test inside the app's own
// per-host request budget (platforms.js: perMinute and maxRequests per book check).
import fs from 'node:fs';
const API = 'https://mybookshelf.cloud/api/v2/holdings/check';
const libs = JSON.parse(fs.readFileSync('libraries.json', 'utf8'));
const GAP = { egranthalaya: 12000, libman: 8000, indcat: 16000, koha: 30000, 'discovery-academic': 40000, 'discovery-community': 40000 };
const books = [
  ['v1:openlibrary:OL1037811W', 'Wings of Fire, Kalam (title)', 'Indian non-fiction, English'],
  ['v1:isbn:9788173711466', 'Wings of Fire (ISBN)', 'Indian non-fiction, English'],
  ['v1:openlibrary:OL17047576W', 'Godaan, Premchand (title)', 'Hindi classic'],
  ['v1:openlibrary:OL356672W', 'Ponniyin Selvan, Kalki (title)', 'Tamil classic'],
  ['v1:openlibrary:OL296039W', 'The Discovery of India, Nehru (title)', 'History'],
  ['v1:openlibrary:OL1057177W', 'Malgudi Days, Narayan (title)', 'Indian fiction, English'],
  ['v1:isbn:9788177091878', 'Concepts of Physics 1, H. C. Verma (ISBN)', 'School and entrance textbook'],
  ['v1:isbn:9780262033848', 'Introduction to Algorithms, 3rd ed. (ISBN)', 'University textbook'],
  ['v1:isbn:9781408855652', "Harry Potter and the Philosopher's Stone (ISBN)", "Children's"],
  ['v1:isbn:9781847941831', 'Atomic Habits (ISBN)', 'Recent non-fiction'],
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = fs.createWriteStream('results.jsonl', { flags: 'a' });
async function check(lib, book, n) {
  const t = Date.now(); let status = 0, body = {}, error = '';
  try {
    const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ libraryId: lib.id, bookKey: book[0] }), signal: AbortSignal.timeout(90000) });
    status = r.status; body = await r.json().catch(() => ({}));
  } catch (e) { error = e.name; }
  const row = { at: new Date().toISOString(), order: n, libraryId: lib.id, library: lib.name, system: lib.platform, state: lib.state, host: lib.host, listing: lib.listing, verifiedBooks: lib.verified, repeat: !!lib.repeat, bookKey: book[0], book: book[1], kind: book[2], status, answer: body.answer || (body.error && body.error.code) || error || 'none', linkKind: body.catalogLinkKind || '', catalogUrl: body.catalogUrl || '', ms: Date.now() - t };
  out.write(JSON.stringify(row) + '\n'); console.log(row.library.slice(0, 30).padEnd(30), row.book.slice(0, 28).padEnd(28), String(row.status), row.answer.padEnd(12), row.ms);
}
const groups = {}; for (const l of libs) (groups[l.host] ||= []).push(l);
await Promise.all(Object.values(groups).map(async g => { for (const lib of g) { let n = 0; for (const book of books) { await check(lib, book, ++n); await sleep(GAP[lib.platform] || 30000); } } }));
out.end(); console.log('done');
