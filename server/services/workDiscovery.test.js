import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkDiscovery as factory } from './workDiscovery.js';
import { createPublicBookService } from '../public-v2/metadata.js';
import { searchLibraryBook } from './libraryBookSearch.js';

const createWorkDiscovery = options => factory({ fallbackText: async () => [], ...options });

const work = { key: '/works/OL1037811W', title: 'Wings of Fire', author_name: ['A. P. J. Abdul Kalam'], edition_count: 9, language: ['eng', 'hin'] };
const edition = { title: 'Wings of Fire', isbn_10: ['8173711461'], works: [{ key: work.key }], languages: [{ key: '/languages/eng' }] };

test('free title/author discovery groups by work and never selects an arbitrary ISBN', async () => {
  let path;
  const discovery = createWorkDiscovery({ read: async value => {
    path = value;
    return { docs: [work, work, { ...work, key: '/works/OL999W', author_name: ['Tui T. Sutherland'] }] };
  } });
  const service = createPublicBookService({ searchByText: discovery.search });
  const { candidates } = await service.search({ query: 'Wings of Fire' });
  assert.match(new URL(path, 'https://openlibrary.org').searchParams.get('q'), /title:wings OR author:wings/);
  assert.equal(new URL(path, 'https://openlibrary.org').searchParams.get('fields').includes('editions,'), false);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].bookKey, 'v1:openlibrary:OL1037811W');
  assert.equal(candidates[0].isbn13, undefined);
  assert.equal(candidates[0].editionCount, 9);
  assert.notEqual(candidates[0].bookKey, candidates[1].bookKey);
});

test('successful work discovery also checks the independent source for missing books', async () => {
  let fallbackCalls = 0;
  const discovery = createWorkDiscovery({ read: async () => ({ docs: [work] }), fallbackText: async () => { fallbackCalls++; return []; } });
  assert.equal((await discovery.search({ title: 'Wings of Fire' }))[0].workId, 'OL1037811W');
  assert.equal(fallbackCalls, 1);
});

test('a title-specific query recovers other authors beyond the first ten series hits', async () => {
  const dragons = Array.from({ length: 15 }, (_, index) => ({ ...work, key: `/works/OL${100 + index}W`,
    title: `Wings of Fire: Volume ${index + 1}`, author_name: ['Tui T. Sutherland'], alternative_title: ['Wings of Fire'], edition_count: 100 }));
  const discovery = createWorkDiscovery({ read: async path => {
    const params = new URL(path, 'https://openlibrary.org').searchParams;
    return { docs: params.get('title') === 'Wings of Fire' ? [work] : dragons, numFound: 15 };
  }, fallbackText: async () => [{ source_id: 'another-author', title: 'Wings of Fire', author: 'Charles Todd' }] });
  const result = await discovery.searchPage({ title: 'Wings of Fire' });
  assert.equal(result.books[0].workId, 'OL1037811W');
  assert.equal(result.books.length, 17);
  assert.ok(result.books.some(book => book.source_id === 'another-author'));
  assert.ok(result.books.some(book => book.title === 'Wings of Fire: Volume 15'));
});

test('later pages use the same source offsets and preserve a successful source during an outage', async () => {
  const calls = [];
  const discovery = createWorkDiscovery({ read: async path => {
    const params = new URL(path, 'https://openlibrary.org').searchParams;
    calls.push(Number(params.get('offset')));
    if (!params.has('title')) throw new Error('one search route is unavailable');
    return { docs: [work], numFound: 41 };
  }, fallbackText: async ({ offset }) => { assert.equal(offset, 40); throw new Error('unavailable'); } });
  const result = await discovery.searchPage({ title: 'Wings of Fire', offset: 40 });
  assert.deepEqual(calls, [40, 40, 40]);
  assert.equal(result.books[0].workId, 'OL1037811W');
  assert.equal(result.nextOffset, null);
  assert.equal(result.partial, true);
});

test('provider pagination remains available even when a raw page has no relevant matches', async () => {
  const discovery = createWorkDiscovery({ read: async () => ({ docs: [{ ...work, title: 'Unrelated book' }], numFound: 100 }) });
  const result = await discovery.searchPage({ title: 'Wings of Fire', offset: 40 });
  assert.deepEqual(result.books, []);
  assert.equal(result.nextOffset, 80);
});

test('text discovery falls back on both missing works and a failed work source without inventing work equivalence', async () => {
  for (const read of [async () => ({ docs: [] }), async () => { throw new Error('upstream unavailable'); }]) {
    const edition = { title: 'A Modern Approach to Logical Reasoning', author: 'R. S. Aggarwal', source_id: 'google_reasoning' };
    const discovery = createWorkDiscovery({ read, fallbackText: async query => {
      assert.deepEqual(query, { query: 'modern approach logical reasoning', max: 40 });
      return [edition];
    } });
    const service = createPublicBookService({ searchByText: discovery.search, resolveGoogleVolume: async () => edition });
    const result = await service.search({ query: edition.title });
    assert.equal(result.candidates[0].bookKey, 'v1:googlebooks:google_reasoning');
    assert.equal(result.candidates[0].workId, undefined);
    assert.equal((await service.resolve(result.candidates[0].bookKey)).title, edition.title);
  }
});

test('a transient work failure gets one retry when the fallback has no result', async () => {
  let calls = 0;
  const discovery = createWorkDiscovery({ read: async () => {
    if (++calls === 1) throw new Error('temporary failure');
    return { docs: [work] };
  }, fallbackText: async () => [] });
  assert.equal((await discovery.search({ title: 'Wings of Fire' }))[0].workId, 'OL1037811W');
  assert.equal(calls, 3);
});

test('outages stay explicit and bounded; only successful empty sources mean no matches', async () => {
  let calls = 0;
  const discovery = createWorkDiscovery({ read: async () => { calls++; throw new Error('offline'); }, fallbackText: async () => { throw new Error('offline'); } });
  await assert.rejects(discovery.search({ title: 'Wings of Fire' }), { code: 'BOOK_METADATA_UNAVAILABLE' });
  assert.equal(calls, 6);
  const incomplete = createWorkDiscovery({ read: async () => ({ docs: [] }), fallbackText: async () => { throw new Error('offline'); } });
  await assert.rejects(incomplete.search({ title: 'Unlisted book' }), { code: 'BOOK_METADATA_UNAVAILABLE' });
  const empty = createWorkDiscovery({ read: async () => ({ docs: [] }), fallbackText: async () => [] });
  assert.deepEqual(await empty.search({ title: 'Unlisted book' }), []);
});

test('fallback sources cannot reintroduce unrelated keyword matches', async () => {
  const wrong = { title: 'Artificial Intelligence: A Modern Approach', author: 'Stuart Russell', source_id: 'wrong' };
  const discovery = createWorkDiscovery({ read: async () => ({ docs: [] }), fallbackText: async () => [wrong] });
  assert.deepEqual(await discovery.search({ title: 'Modern approach to logical reasoning' }), []);
});

test('strict searches precede spelling recovery and expose a suggestion label', async () => {
  const queries = [];
  const discovery = createWorkDiscovery({ read: async path => {
    const params = new URL(path, 'https://openlibrary.org').searchParams;
    const query = params.get('q') || params.get('title'); queries.push(query);
    return { docs: query.includes('~') ? [{ key: '/works/OL66554W', title: 'Pride and Prejudice', author_name: ['Jane Austen'] }] : [] };
  }, fallbackText: async () => { throw new Error('Must not call fallback'); } });
  const service = createPublicBookService({ searchByText: discovery.search });
  const result = await service.search({ query: 'prdie prejudice austen' });
  assert.equal(queries.length, 4);
  assert.equal(queries[0].includes('~'), false);
  assert.equal(result.candidates[0].searchMatch, 'spelling');
  assert.equal(result.candidates[0].bookKey, 'v1:openlibrary:OL66554W');
});

test('alternate edition titles recover a work without transferring an edition ISBN', async () => {
  const paths = [];
  const discovery = createWorkDiscovery({ read: async path => {
    paths.push(path);
    if (path.startsWith('/works/')) return { entries: [{ title: '1984', isbn_13: ['9780451524935'] }] };
    return { docs: [{ key: '/works/OL1168083W', title: 'Nineteen Eighty-Four', author_name: ['George Orwell'] }] };
  }, fallbackText: async () => [] });
  const result = await discovery.search({ title: '1984 Orwell' });
  assert.equal(result[0].workId, 'OL1168083W');
  assert.equal(result[0].title, '1984');
  assert.equal(result[0].isbn, undefined);
  assert.equal(paths.filter(path => path.startsWith('/works/')).length, 1);
});

test('prefix recovery validates the full spelling and preserves Tamil vowel signs', async () => {
  const paths = [];
  const discovery = createWorkDiscovery({ read: async path => {
    paths.push(path);
    const query = new URL(path, 'https://openlibrary.org').searchParams.get('q') || '';
    return { docs: query.includes('திரு*') ? [
      { key: '/works/OL331347W', title: 'திருக்குறள்', author_name: ['Tiruvalluvar'] },
      { key: '/works/OL999W', title: 'திருமந்திரம்', author_name: ['Thirumoolar'] },
    ] : [] };
  }, fallbackText: async () => [] });
  const result = await discovery.search({ title: 'திருகுறள்' });
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'திருக்குறள்');
  assert.equal(result[0].searchMatch, 'spelling');
  assert.equal(paths.filter(path => path.startsWith('/search')).length, 5);
});

test('cold work resolution restores authors; scanning retains the exact ISBN plus work identity', async () => {
  const discovery = createWorkDiscovery({ read: async path => path.startsWith('/isbn/') ? edition
    : path.startsWith('/search') ? { docs: [work] } : { ...work, description: { value: 'An autobiography' } } });
  const service = createPublicBookService({ resolveOpenLibraryWork: discovery.resolve, lookupByIsbn: discovery.lookup });
  const book = await service.resolve('v1:openlibrary:OL1037811W');
  assert.deepEqual(book.authors, work.author_name);
  assert.equal(book.description, 'An autobiography');
  const scanned = await service.resolve('v1:isbn:9788173711466');
  assert.equal(scanned.bookKey, 'v1:isbn:9788173711466');
  assert.equal(scanned.workId, 'OL1037811W');
  assert.equal(scanned.language, 'eng');
});

test('edition expansion deduplicates equivalent ISBNs and excludes other languages and audio', async () => {
  const read = async () => ({ size: 101, entries: [edition, { ...edition, isbn_13: ['9788173711466'] },
    { ...edition, isbn_13: ['9788173715181'], isbn_10: [], physical_format: 'Paperback' },
    { ...edition, isbn_13: ['9780590353403'], isbn_10: [], languages: [{ key: '/languages/hin' }] },
    { ...edition, isbn_13: ['9780439554930'], isbn_10: [], physical_format: 'Audio CD' },
    { ...edition, isbn_13: ['9780590353427'], isbn_10: [], languages: [] }] });
  const discovery = createWorkDiscovery({ read });
  const profile = await discovery.profile({ workId: 'OL1037811W', title: work.title, authors: work.author_name, isbn13: '9788173711466', language: 'eng' });
  assert.deepEqual(profile.isbns, ['9788173711466', '9788173715181']);
  assert.equal(profile.complete, false);
  const hindi = await discovery.profile({ workId: 'OL1037811W', title: work.title, authors: work.author_name, isbn13: '9788173711466', language: 'eng' }, { language: 'hin' });
  assert.deepEqual(hindi.isbns, ['9780590353403']);
});

test('expansion failure preserves the original ISBN; exact mode never expands', async () => {
  let calls = 0;
  const discovery = createWorkDiscovery({ read: async () => { calls++; throw new Error('offline'); } });
  const book = { workId: 'OL1037811W', title: work.title, authors: work.author_name, isbn13: '9788173711466' };
  const profile = await discovery.profile(book);
  assert.deepEqual(profile.isbns, [book.isbn13]);
  assert.equal(profile.expansionFailed, true);
  await discovery.profile(book, { editionScope: 'exact' });
  assert.equal(calls, 1);
});

test('missing language metadata does not prevent a verified work ISBN reaching an ISBN-only catalog', async () => {
  const book = { workId: 'OL29062473W', title: 'A Modern Approach to Logical Reasoning', authors: ['R. S. Aggarwal'], languages: [] };
  const discovery = createWorkDiscovery({ read: async () => ({ size: 1, entries: [{ title: book.title, physical_format: 'paperback', isbn_13: ['9788121919050'] }] }) });
  const profile = await discovery.profile(book);
  assert.deepEqual(profile.isbns, ['9788121919050']);
  assert.equal(profile.language, '');
  const queried = [];
  const observation = await searchLibraryBook({ checkAvailability: async isbn => {
    queried.push(isbn);
    return { outcome: 'available', matchKind: 'exact_isbn', availableCopies: 1, totalCopies: 1 };
  } }, profile);
  assert.deepEqual(queried, ['9788121919050']);
  assert.equal(observation.outcome, 'available');
  assert.equal(observation.matchKind, 'verified_work');
  assert.equal(observation.matchedBook.isbn13, '9788121919050');

  const filtered = await discovery.profile(book, { language: 'tam' });
  assert.deepEqual(filtered.isbns, []);
});
