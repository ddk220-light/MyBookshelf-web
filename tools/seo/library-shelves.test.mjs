import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  askOrder, nextBook, recordCheck, createFailurePolicy, createHostQueue, serializeShelves, emptyShelves, foundCounts, shelfOf,
  chooseCandidates, libraryScore, libraryKind, uniqueSlug, bookSlug, slugify, shortDescription, SHELF_SIZE, EXCLUDED_IDS,
} from './shelves-core.mjs';
import { answeredInPhoneTest } from './library-shelves.mjs';

const pool = [
  ...Array.from({ length: 12 }, (_, i) => ({ bookKey: `g${i}`, shelf: 'general' })),
  ...Array.from({ length: 6 }, (_, i) => ({ bookKey: `a${i}`, shelf: 'academic' })),
];
const ON = '2026-11-21';
const found = (on = ON) => ({ outcome: 'found', on });

test('ask order: general books first for a public library, academic and general alternating for an academic one', () => {
  assert.deepEqual(askOrder(pool, 'public').map(b => b.bookKey).slice(0, 13), [...Array.from({ length: 12 }, (_, i) => `g${i}`), 'a0']);
  assert.deepEqual(askOrder(pool, 'academic').map(b => b.bookKey).slice(0, 6), ['a0', 'g0', 'a1', 'g1', 'a2', 'g2']);
  assert.equal(askOrder(pool, 'academic').length, pool.length);
  assert.equal(libraryKind('Central Library, IIT Goa'), 'academic');
  assert.equal(libraryKind('SRS Central Library'), 'public');
});

test('next book: the fixed order, books found elsewhere first, and stop at ten found or when the pool is used up', () => {
  const order = askOrder(pool, 'public');
  assert.equal(nextBook({ checks: {} }, order, { on: ON }).bookKey, 'g0');
  // A book found at another library is asked first, in the same order among such books.
  assert.equal(nextBook({ checks: {} }, order, { on: ON, foundElsewhere: new Map([['g5', 2], ['g3', 1]]) }).bookKey, 'g3');
  // ... but only among the kind of book asked next: a public library still hears general books first.
  assert.equal(nextBook({ checks: {} }, order, { on: ON, foundElsewhere: new Map([['a2', 3]]) }).bookKey, 'g0');
  const academic = askOrder(pool, 'academic');
  assert.equal(nextBook({ checks: { a0: found() } }, academic, { on: ON, foundElsewhere: new Map([['a3', 1], ['g4', 1]]) }).bookKey, 'g4');
  assert.equal(nextBook({ checks: { a0: found(), g4: found() } }, academic, { on: ON, foundElsewhere: new Map([['a3', 1], ['g4', 1]]) }).bookKey, 'g0');
  // Answered books are not asked again.
  assert.equal(nextBook({ checks: { g0: found(), g1: { outcome: 'not_found', on: ON } } }, order, { on: ON }).bookKey, 'g2');
  // Ten found: done.
  const ten = Object.fromEntries(Array.from({ length: SHELF_SIZE }, (_, i) => [`g${i}`, found()]));
  assert.equal(nextBook({ checks: ten }, order, { on: ON }), null);
  // Fewer than ten, but every book answered: done.
  const all = Object.fromEntries(pool.map((b, i) => [b.bookKey, i < 4 ? found() : { outcome: 'not_found', on: ON }]));
  assert.equal(nextBook({ checks: all }, order, { on: ON }), null);
  // Refresh: answers older than the date are asked again.
  assert.equal(nextBook({ checks: ten }, order, { on: ON, refreshBefore: '2026-12-01' }).bookKey, 'g0');
});

test('a failed check is never "not found": it is kept as couldn\'t check, asked again only on a later day, and never replaces an answer', () => {
  const order = askOrder(pool, 'public');
  const failed = recordCheck(undefined, { outcome: 'couldnt_check', reason: 'timeout' }, ON);
  assert.deepEqual(failed, { outcome: 'couldnt_check', on: ON, reason: 'timeout' });
  assert.notEqual(failed.outcome, 'not_found');
  // Same day: not asked again (no loop).
  assert.equal(nextBook({ checks: { g0: failed } }, order, { on: ON }).bookKey, 'g1');
  // A later day: asked again.
  assert.equal(nextBook({ checks: { g0: failed } }, order, { on: '2026-11-22' }).bookKey, 'g0');
  // A failure after a found keeps the found.
  const kept = recordCheck(found('2026-11-01'), { outcome: 'couldnt_check', reason: 'unavailable' }, ON);
  assert.equal(kept.outcome, 'found');
  assert.equal(kept.on, '2026-11-01');
  // A not-found answer is an answer.
  assert.deepEqual(recordCheck(failed, { outcome: 'not_found' }, ON), { outcome: 'not_found', on: ON });
});

test('a found check records the catalog row title and only a record link', () => {
  const answer = { outcome: 'found', catalogUrl: 'https://opac.example/record/1', catalogLinkKind: 'record', matches: [{ title: 'Wings of fire : an autobiography', author: 'Kalam' }] };
  assert.deepEqual(recordCheck(undefined, answer, ON), { outcome: 'found', on: ON, matchTitle: 'Wings of fire : an autobiography', catalogUrl: 'https://opac.example/record/1' });
  assert.equal(recordCheck(undefined, { ...answer, catalogLinkKind: 'search', catalogUrl: 'https://opac.example/search?q=x' }, ON).catalogUrl, undefined);
});

test('failure policy: a blocking sign skips the host at once; four failures in a row skip it; three skip a library', () => {
  const policy = createFailurePolicy();
  assert.equal(policy.note('h1', 'l1', { outcome: 'couldnt_check', reason: 'blocked' }), 'host');
  assert.equal(policy.hostSkipped('h1'), 'blocked');
  const fail = { outcome: 'couldnt_check', reason: 'timeout' };
  assert.equal(policy.note('h2', 'a', fail), null);
  assert.equal(policy.note('h2', 'b', fail), null);
  assert.equal(policy.note('h2', 'c', fail), null);
  assert.equal(policy.note('h2', 'd', fail), 'host');
  policy.note('h3', 'x', fail); policy.note('h3', 'x', { outcome: 'not_found' });
  policy.note('h3', 'x', fail); policy.note('h3', 'x', fail);
  assert.equal(policy.hostSkipped('h3'), null);
  assert.equal(policy.note('h3', 'x', fail), 'library');
  assert.ok(policy.librarySkipped('x'));
});

test('host queue: one request at a time per host with a fixed gap; different hosts run in parallel', async () => {
  let clock = 0;
  const slept = [];
  const queue = createHostQueue({ gapMs: 30_000, now: () => clock, sleep: async ms => { slept.push(ms); clock += ms; } });
  const events = [];
  let running = 0, most = 0;
  const task = (name, ms) => async () => { running += 1; most = Math.max(most, running); events.push(`${name}@${clock}`); await Promise.resolve(); clock += ms; running -= 1; return name; };
  const results = await Promise.all([queue.run('eg4', task('a', 5000)), queue.run('eg4', task('b', 5000)), queue.run('eg4', task('c', 1000))]);
  assert.deepEqual(results, ['a', 'b', 'c']);
  assert.equal(most, 1);
  assert.deepEqual(slept, [30_000, 30_000]);
  assert.deepEqual(events, ['a@0', 'b@35000', 'c@70000']);
  // A failing task still releases the host for the next one.
  const q2 = createHostQueue({ gapMs: 0 });
  await assert.rejects(q2.run('h', async () => { throw Error('x'); }));
  assert.equal(await q2.run('h', async () => 'next'), 'next');
  // Two hosts overlap.
  let open = 0, overlap = 0;
  const q3 = createHostQueue({ gapMs: 0 });
  const slow = () => async () => { open += 1; overlap = Math.max(overlap, open); await new Promise(r => setTimeout(r, 20)); open -= 1; };
  await Promise.all([q3.run('h1', slow()), q3.run('h2', slow())]);
  assert.equal(overlap, 2);
});

test('the data file is deterministic and resumable: the same record serializes the same way, and a re-run continues from it', () => {
  const data = emptyShelves();
  data.libraries['b:2'] = { slug: 'two', kind: 'public', checks: { g1: { outcome: 'not_found', on: ON }, g0: found() } };
  data.libraries['a:1'] = { kind: 'academic', slug: 'one', checks: { a0: found() } };
  const text = serializeShelves(data);
  assert.equal(text, serializeShelves(JSON.parse(text)));
  assert.ok(text.indexOf('"a:1"') < text.indexOf('"b:2"'));
  assert.ok(text.startsWith('{\n  "about"'));
  const again = JSON.parse(text);
  assert.equal(nextBook(again.libraries['b:2'], askOrder(pool, 'public'), { on: ON }).bookKey, 'g2');
  assert.deepEqual([...foundCounts(again)].sort(), [['a0', 1], ['g0', 1]]);
  assert.deepEqual(shelfOf(again.libraries['b:2'], pool).map(item => item.book.bookKey), ['g0']);
});

test('candidates: listed, not removed or excluded, with public checks; phone-tested first; spread by system and state', () => {
  const row = (id, name, platform = 'koha', region = 'Kerala', extra = {}) => ({ id, name, platform, region, country: 'IN', publicCatalogCapabilities: { publicAvailability: true }, ...extra });
  const entries = [
    row('koha:a', 'State Central Library'), row('koha:b', 'Some College Library'), row('koha:c', 'IIT Somewhere Central Library'),
    row('koha:removed', 'Removed Public Library'), row('koha:unlisted', 'District Library X'), row(EXCLUDED_IDS[1], 'Karnataka Samskrit University Library'),
    row('koha:dept', 'Department of Physics Library'), row('koha:generic', 'Central Library'), row('koha:nocheck', 'City Public Library', 'koha', 'Kerala', { publicCatalogCapabilities: {} }),
    row('eg:1', 'District Library One', 'egranthalaya', 'Bihar'), row('eg:2', 'District Library Two', 'egranthalaya', 'Bihar'), row('eg:3', 'District Library Three', 'egranthalaya', 'Bihar'),
    row('us:1', 'Public Library', 'bc', 'California', { country: 'US' }),
  ];
  const listedIds = entries.map(e => e.id).filter(id => id !== 'koha:unlisted');
  const chosen = chooseCandidates(entries, { listedIds, removed: ['koha:removed'], answered: ['koha:b'], platformCaps: { koha: 5, egranthalaya: 2 }, stateCap: 10 });
  assert.deepEqual(chosen.map(c => c.id), ['koha:b', 'koha:a', 'koha:c', 'eg:1', 'eg:2']);
  assert.ok(chosen[0].phoneTested);
  assert.equal(libraryScore({ name: 'Kendriya Vidyalaya IIT Powai Library' }), 20);
  assert.equal(libraryScore({ name: 'Central Library' }), null);
  // The four libraries the owner left out are never candidates.
  assert.deepEqual(EXCLUDED_IDS.toSorted(), ['discovery-academic:dlib-darshan', 'koha:goa-dhe-cescaccs', 'koha:karnataka-samskrit-university', 'koha:lbsnaa-gandhi-smriti']);
  const file = JSON.parse(readFileSync('shared/seo-shelf-candidates.json', 'utf8'));
  assert.ok(file.libraries.length >= 140 && file.libraries.length <= 160);
  assert.ok(!file.libraries.some(item => EXCLUDED_IDS.includes(item.id)));
  assert.ok(Object.keys(file.byPlatform).length >= 5);
});

test('phone-test libraries that answered are read from the CSV; unknown-only libraries are not', () => {
  const csv = 'at,libraryId,library,system,bookKey,book,cardWords,checkAnswer,settledMs,cardSentence\n'
    + 't,lib:a,"A, Library",koha,k,"B, C",w,found,1,s\nt,lib:b,B,koha,k,b,w,unknown,1,s\nt,lib:c,C,koha,k,b,w,not_found,1,"x, y"\n';
  assert.deepEqual(answeredInPhoneTest(csv), ['lib:a', 'lib:c']);
});

test('slugs: plain ASCII, stable parts, a suffix only on a clash', () => {
  assert.equal(slugify('Chozha Central Library, Central University of Tamil Nadu'), 'chozha-central-library-central-university-of-tamil-nadu');
  assert.equal(slugify('Alliance Française — Pondicherry'), 'alliance-francaise-pondicherry');
  const taken = new Set(['district-library']);
  assert.equal(uniqueSlug(['District Library', 'Kupwara'], 'x', taken), 'district-library-kupwara');
  assert.match(uniqueSlug(['District Library'], 'x', taken), /^district-library-[a-z0-9]+$/);
  assert.equal(bookSlug({ bookKey: 'k', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'] }, new Set()), 'wings-of-fire-kalam');
  assert.equal(bookSlug({ bookKey: 'k', title: "Midnight's Children", authors: ['Salman Rushdie'] }, new Set()), 'midnights-children-rushdie');
});

test('descriptions are short and end at a sentence', () => {
  const long = 'First sentence is here and it is long enough to matter for this test. ' + 'More words follow. '.repeat(40);
  const short = shortDescription(long);
  assert.ok(short.length <= 320 && short.endsWith('.'));
  assert.equal(shortDescription('See [x](https://a.example) here https://b.example'), 'See here');
  assert.equal(shortDescription(''), null);
});
