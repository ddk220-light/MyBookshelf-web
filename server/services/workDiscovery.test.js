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
  // The primary source failing is an outage even when the fallback answers empty.
  const primaryDown = createWorkDiscovery({ read: async () => { throw new Error('offline'); }, fallbackText: async () => [] });
  await assert.rejects(primaryDown.search({ title: 'Unlisted book' }), { code: 'BOOK_METADATA_UNAVAILABLE' });
  const empty = createWorkDiscovery({ read: async () => ({ docs: [] }), fallbackText: async () => [] });
  assert.deepEqual(await empty.search({ title: 'Unlisted book' }), []);
});

test('a successful empty primary answer stays a definite "no books" when the fallback source fails', async () => {
  // Open Library answers every mode (strict, spelling and prefix) with nothing;
  // Google Books is down or not configured. Misspelled query from staging.
  for (const fallbackText of [async () => { throw new Error('offline'); }, async () => { throw Object.assign(new Error('no key'), { code: 'BOOK_METADATA_UNAVAILABLE' }); }]) {
    const discovery = createWorkDiscovery({ read: async () => ({ docs: [], numFound: 0 }), fallbackText });
    assert.deepEqual(await discovery.searchPage({ title: 'wngs fyre kalmx qzv' }), { books: [], nextOffset: null });
    assert.deepEqual(await discovery.searchPage({ title: 'wngs fyre kalmx qzv', offset: 40 }), { books: [], nextOffset: null });
    // Through the public book service the client gets an empty candidates
    // answer (shown as "No books found"), not METADATA_UNAVAILABLE.
    const service = createPublicBookService({ searchByText: discovery.searchPage });
    const result = await service.search({ query: 'wngs fyre kalmx qzv' });
    assert.deepEqual([result.kind, result.candidates, result.partial], ['candidates', [], undefined]);
  }
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

test('popularity fields are requested and rank results without reaching the public book shape', async () => {
  const paths = [];
  const stone = { key: '/works/OL82563W', title: "Harry Potter and the Philosopher's Stone", author_name: ['J. K. Rowling'], edition_count: 400, readinglog_count: 24733 };
  const guide = { key: '/works/OL1W', title: 'Harry Potter', author_name: ['Jody Revenson'], edition_count: 1, readinglog_count: 18 };
  const discovery = createWorkDiscovery({ read: async path => { paths.push(path); return { docs: [guide, stone] }; } });
  const service = createPublicBookService({ searchByText: discovery.searchPage });
  const { candidates } = await service.search({ query: 'harry potter' });
  assert.ok(paths.every(path => new URL(path, 'https://openlibrary.org').searchParams.get('fields').includes('readinglog_count,want_to_read_count,already_read_count,ratings_count')));
  assert.deepEqual(candidates.map(book => book.workId), ['OL82563W', 'OL1W']);
  assert.equal('popularity' in candidates[0] || 'sourceRank' in candidates[0], false);
  assert.equal(paths.length, 3);
});

test('a search that names an author adds one reader-ordered author request and puts their works first', async () => {
  const paths = [];
  const own = (id, title, readers) => ({ key: `/works/OL${id}W`, title, author_name: ['Rasipuram Krishnaswamy Narayan'], author_alternative_name: ['R. K. Narayan'], readinglog_count: readers });
  const about = { key: '/works/OL9W', title: 'R.K. Narayan', author_name: ['William Walsh'], readinglog_count: 4 };
  const discovery = createWorkDiscovery({ read: async path => {
    paths.push(path);
    const params = new URL(path, 'https://openlibrary.org').searchParams;
    if (params.get('sort') === 'readinglog') return { docs: [own(1, 'Malgudi Days', 199), own(2, 'Swami and Friends', 92)], numFound: 2 };
    return { docs: [about, own(3, 'The Guide', 65), own(4, 'The English Teacher', 81), own(5, 'The Painter of Signs', 81)] };
  } });
  const books = await discovery.search({ title: 'R. K. Narayan' });
  const authorPaths = paths.filter(path => new URL(path, 'https://openlibrary.org').searchParams.get('sort') === 'readinglog');
  assert.equal(authorPaths.length, 1);
  assert.equal(new URL(authorPaths[0], 'https://openlibrary.org').searchParams.get('author'), 'R K Narayan');
  assert.equal(paths.length, 4);
  assert.equal(books[0].title, 'Malgudi Days');
  assert.equal(books.at(-1).workId, 'OL9W');
  assert.equal(new Set(books.map(book => book.workId)).size, books.length);
});

test('strict matches found only through another edition title also get the spelling pass on the first page', async () => {
  const paths = [];
  const goblet = { key: '/works/OL82560W', title: 'Harry Potter and the Goblet of Fire', author_name: ['J. K. Rowling'], readinglog_count: 5060,
    editions: { docs: [{ title: 'Harijs Poters un uguns biķeris (Latvian) Harry Potter and the Goblet of Fire' }] } };
  const stone = { key: '/works/OL82563W', title: "Harry Potter and the Philosopher's Stone", author_name: ['J. K. Rowling'], readinglog_count: 24733 };
  const spelling = path => /~2/.test(new URL(path, 'https://openlibrary.org').searchParams.get('q') || '');
  const read = async path => { paths.push(path); return spelling(path) ? { docs: [stone], numFound: 1 } : { docs: [goblet], numFound: 1 }; };
  const first = await createWorkDiscovery({ read, fallbackText: async () => [] }).searchPage({ title: 'harry poter' });
  assert.equal(paths.filter(spelling).length, 1);
  assert.deepEqual(first.books.map(item => item.workId).sort(), ['OL82560W', 'OL82563W']);
  assert.equal(first.books.find(item => item.workId === 'OL82563W').searchMatch, 'spelling');
  assert.equal(first.books.find(item => item.workId === 'OL82560W').searchMatch, undefined);

  // A later page continues the original words, and a failed optional
  // spelling request keeps the strict matches.
  paths.length = 0;
  await createWorkDiscovery({ read, fallbackText: async () => [] }).searchPage({ title: 'harry poter', offset: 40 });
  assert.equal(paths.filter(spelling).length, 0);
  const failing = createWorkDiscovery({ read: async path => { if (spelling(path)) throw new Error('down'); return { docs: [goblet], numFound: 1 }; }, fallbackText: async () => [] });
  const kept = await failing.searchPage({ title: 'harry poter' });
  assert.deepEqual(kept.books.map(item => item.workId), ['OL82560W']);

  // A record matching on its own title needs no spelling request.
  paths.length = 0;
  await createWorkDiscovery({ read, fallbackText: async () => [] }).searchPage({ title: 'goblet of fire' });
  assert.equal(paths.filter(spelling).length, 0);
});

test('edition profiles read up to three pages of a widely published work, and stop early when time runs out', async () => {
  const isbn = n => {
    const body = '978' + String(100000000 + n).padStart(9, '0');
    const sum = [...body].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return body + ((10 - (sum % 10)) % 10);
  };
  const page = offset => Array.from({ length: 100 }, (_, i) => ({ title: 'Wings of Fire', physical_format: 'Paperback', languages: [{ key: '/languages/eng' }], isbn_13: [isbn(offset + i)] }));
  const paths = [];
  const read = async path => { paths.push(path); const offset = Number(path.match(/offset=(\d+)/)?.[1] || 0); return { size: 450, entries: page(offset) }; };
  const book = { workId: 'OL1037811W', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'], language: 'eng' };
  const profile = await createWorkDiscovery({ read }).profile(book);
  assert.deepEqual(paths, ['/works/OL1037811W/editions.json?limit=100', '/works/OL1037811W/editions.json?limit=100&offset=100', '/works/OL1037811W/editions.json?limit=100&offset=200']);
  // An edition first listed past the first hundred is now part of the work.
  assert.ok(profile.isbns.includes(isbn(250)));
  assert.equal(profile.isbns.length, 300);
  assert.equal(profile.complete, false);

  // A short last page ends the reading; the work is complete.
  paths.length = 0;
  const short = await createWorkDiscovery({ read: async path => { paths.push(path); return path.includes('offset=100') ? { size: 130, entries: page(100).slice(0, 30) } : { size: 130, entries: page(0) }; } }).profile(book);
  assert.equal(paths.length, 2);
  assert.equal(short.isbns.length, 130);
  assert.equal(short.complete, true);

  // No later page once the profile is older than its window; a failed later page keeps what was read.
  let time = 0;
  paths.length = 0;
  const slow = await createWorkDiscovery({ clock: () => time, read: async path => { paths.push(path); time += 6000; return { size: 450, entries: page(0) }; } }).profile(book);
  assert.equal(paths.length, 1);
  assert.equal(slow.isbns.length, 100);
  const failing = await createWorkDiscovery({ read: async path => { if (path.includes('offset')) throw new Error('offline'); return { size: 450, entries: page(0) }; } }).profile(book);
  assert.equal(failing.isbns.length, 100);
  assert.equal(failing.expansionFailed, false);
  assert.equal(failing.complete, false);
});
