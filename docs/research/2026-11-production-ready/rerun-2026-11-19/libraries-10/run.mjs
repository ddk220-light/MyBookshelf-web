// 10 Indian libraries x 15 books through the app's own check, POST /api/v2/holdings/check.
// One worker per catalog host, checks one at a time with a pause; results appended to results.jsonl.
import fs from 'node:fs';
const API = 'https://mybookshelf.cloud/api/v2/holdings/check';
const libs = [
  ['koha:kalaignar-centenary-library', 'Kalaignar Centenary Library, Madurai', 'Koha', 'ten books verified', 'a'],
  ['koha:anna-centenary-library', 'Anna Centenary Library, Chennai', 'Koha', 'verified', 'b'],
  ['egranthalaya:uplibraries-sclald', 'Central State Library, Prayagraj', 'e-Granthalaya', 'ten books verified', 'c'],
  ['egranthalaya:kvs3-kvnarimedu', 'PM SHRI KV No.1 Narimedu, Madurai', 'e-Granthalaya', 'audit only', 'c'],
  ['indcat:indcat-roor-247667', 'IIT Roorkee', 'INDCAT union catalogue', 'ten books verified', 'd'],
  ['libman:9', 'JSS Science and Technology University, Mysuru', 'LIBMAN', 'ten books verified', 'e'],
  ['discovery-community:rmrl-chennai', 'Roja Muthiah Research Library, Chennai', 'community discovery', 'ten books verified', 'f'],
  ['discovery-academic:soul-iust', 'Islamic University of Science and Technology, Rumi Library', 'SOUL', 'ten books verified', 'g'],
  ['discovery-academic:public-aspx-baba-mastnath-university', 'Baba Mastnath University, Rohtak', 'public ASPX OPAC', 'ten books verified', 'h'],
  ['vpl:visakhapatnam-public-library', 'Visakhapatnam Public Library', 'VPL', 'verified', 'i'],
];
const books = [
  ['v1:openlibrary:OL1037811W', 'Wings of Fire, Kalam'], ['v1:openlibrary:OL356672W', 'Ponniyin Selvan, Kalki'],
  ['v1:openlibrary:OL1052133W', 'The God of Small Things, Roy'], ['v1:openlibrary:OL1057177W', 'Malgudi Days, Narayan'],
  ['v1:openlibrary:OL9740815W', 'The White Tiger, Adiga'], ['v1:openlibrary:OL318479W', 'Train to Pakistan, Singh'],
  ['v1:openlibrary:OL457179W', "Midnight's Children, Rushdie"], ['v1:openlibrary:OL17047576W', 'Godaan, Premchand'],
  ['v1:openlibrary:OL296039W', 'The Discovery of India, Nehru'], ['v1:openlibrary:OL15914981W', 'The Immortals of Meluha, Tripathi'],
  ['v1:isbn:9788173711466', 'Wings of Fire (ISBN)'], ['v1:isbn:9780143039655', 'Malgudi Days (ISBN)'],
  ['v1:isbn:9780062315007', 'The Alchemist (ISBN)'], ['v1:isbn:9781408855652', "Harry Potter and the Philosopher's Stone (ISBN)"],
  ['v1:isbn:9780143333623', "Grandma's Bag of Stories (ISBN)"],
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = fs.createWriteStream('results.jsonl', { flags: 'a' });
async function check(lib, book) {
  const t = Date.now(); let status = 0, body = {}, error = '';
  try {
    const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ libraryId: lib[0], bookKey: book[0] }), signal: AbortSignal.timeout(90000) });
    status = r.status; body = await r.json().catch(() => ({}));
  } catch (e) { error = e.name; }
  const row = { at: new Date().toISOString(), libraryId: lib[0], library: lib[1], system: lib[2], expectation: lib[3], bookKey: book[0], book: book[1], status, answer: body.answer || (body.error && body.error.code) || error || 'none', linkKind: body.catalogLinkKind || '', catalogUrl: body.catalogUrl || '', ms: Date.now() - t };
  out.write(JSON.stringify(row) + '\n'); console.log(row.library.slice(0, 28).padEnd(28), row.book.slice(0, 30).padEnd(30), String(row.status), row.answer.padEnd(12), row.ms);
}
const groups = {}; for (const l of libs) (groups[l[4]] ||= []).push(l);
await Promise.all(Object.values(groups).map(async g => { for (const lib of g) for (const book of books) { await check(lib, book); await sleep(3000); } }));
out.end(); console.log('done');
