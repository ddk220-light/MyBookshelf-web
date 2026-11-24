import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SEARCH_INDEX, SEARCH_SOURCE, aspenSite, librarySearch, parseAspenSearch, searchTerm, searchUrl } from './aspen.js';
import { clearHttpCache, USER_AGENT } from './http.js';
import { getProvider } from './index.js';
import { searchLibraryBook } from '../libraryBookSearch.js';
import { formatKind } from '../rowFormats.js';
import { platformFor, hostFor } from '../catalog-lookup/platforms.js';
import { getAllLibraries, getLibraryById } from '../directory.js';

// Saved Aspen Discovery pages (server/test/fixtures/aspen/), Greenville County
// Library System (aspen.greenvillelibrary.org, Aspen 26.10): two of research
// item 7's (23 November 2026: a title search for To Kill a Mockingbird, and a
// keyword search the catalog has nothing for) and four of the adapter's own
// live keyword searches (24 November 2026, as Claude-User). Scripts, styles,
// copy-location lines and onclick handlers are cut; the results markup is as
// served.
const fixture = name => fs.readFileSync(new URL(`../../test/fixtures/aspen/${name}`, import.meta.url), 'utf8');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; clearHttpCache(); });

const greenville = { id: 'aspen:test-greenville', platform: 'aspen', baseUrl: 'https://aspen.greenvillelibrary.org/' };
const site = aspenSite(greenville);

function serve(...answers) {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    const answer = answers[Math.min(calls.length, answers.length) - 1];
    if (answer instanceof Error) throw answer;
    if (answer instanceof Response) return answer;
    return new Response(answer, { status: 200, headers: { 'content-type': 'text/html; charset=UTF-8' } });
  };
  return calls;
}
const coded = async (promise, code) => assert.rejects(promise, error => error.code === code);

test('one keyword search: a single cold GET of /Search/Results in the library catalog, no cookie, no redirect followed, never /API/ or /Search/AJAX', async () => {
  const calls = serve(fixture('greenville-live-lessons-in-chemistry.html'));
  const rows = await librarySearch(greenville, 'Lessons in Chemistry');
  assert.equal(calls.length, 1);
  const [{ url, options }] = calls;
  assert.equal(url, 'https://aspen.greenvillelibrary.org/Search/Results?lookfor=Lessons+in+Chemistry&searchIndex=Keyword&searchSource=local');
  assert.equal(SEARCH_INDEX, 'Keyword');
  assert.equal(SEARCH_SOURCE, 'local');
  assert.equal(options.method ?? 'GET', 'GET');
  assert.equal(options.redirect, 'manual');
  assert.equal(options.headers['User-Agent'], USER_AGENT);
  assert.equal(options.headers.Cookie, undefined);
  assert.doesNotMatch(url, /\/API\/|\/Search\/AJAX/);
  // Twenty works, one row per work and format; the novel's four formats first, with its own record link.
  assert.equal(rows.length, 36);
  assert.equal(new Set(rows.map(row => row.catalogUrl)).size, 20);
  const work = 'https://aspen.greenvillelibrary.org/GroupedWork/a51163b3-3b28-7db3-8faf-6a6d05f9e9f3-eng/Home';
  assert.deepEqual(rows.slice(0, 4), ['Book', 'Audiobook on CD', 'Large Print', 'Online Content'].map(format => ({ recordId: 'a51163b3-3b28-7db3-8faf-6a6d05f9e9f3-eng',
    title: 'Lessons in chemistry', authors: ['Garmus, Bonnie'], isbns: [], catalogUrl: work, catalogLinkKind: 'record', format })));
  for (const row of rows) {
    assert.ok(row.title && row.catalogUrl.startsWith('https://aspen.greenvillelibrary.org/') && !row.catalogUrl.includes('?'), row.title);
    assert.match(row.recordId, /^[A-Za-z0-9._-]+$/);
    assert.ok(formatKind(row.format), row.format);
  }
});

test('the research pages: a title search lists grouped works, single records, films, music and guides; "No Results Found" is an answer', () => {
  const rows = parseAspenSearch(fixture('greenville-research-title-to-kill-a-mockingbird.html'), site);
  assert.equal(rows.length, 18);
  assert.equal(new Set(rows.map(row => row.catalogUrl)).size, 15);
  assert.deepEqual(rows.filter(row => row.recordId === 'd1bb18fe-b52c-5639-374e-658952b4c5a4-eng').map(row => row.format), ['Book', 'Audiobook on CD', 'Large Print', 'Online Content']);
  // A single record's link is its own record page; a row with no author line has no author.
  assert.deepEqual(rows[4], { recordId: '51907', title: 'To kill a mockingbird', authors: [], isbns: [], catalogUrl: 'https://aspen.greenvillelibrary.org/Record/51907', catalogLinkKind: 'record', format: 'DVD' });
  assert.deepEqual(rows.find(row => row.format === 'Music CD'), { recordId: '46930', title: 'To kill a mockingbird: original motion picture score', authors: ['Bernstein, Elmer'],
    isbns: [], catalogUrl: 'https://aspen.greenvillelibrary.org/Record/46930', catalogLinkKind: 'record', format: 'Music CD' });
  assert.deepEqual(parseAspenSearch(fixture('greenville-research-keyword-not-held.html'), site), []);
});

test('the term is plain words: query syntax becomes spaces, words and inner hyphens stay', () => {
  assert.equal(searchTerm('Oh, the Places You\'ll Go!'), 'Oh, the Places You\'ll Go');
  assert.equal(searchTerm('author: "Kinney" -wimpy Spider-Man [a TO z] (x) ~y* ?'), 'author Kinney wimpy Spider-Man a TO z x y');
  assert.equal(searchTerm('9780385547345'), '9780385547345');
  assert.equal(searchUrl(site, 'Cien años de soledad'), 'https://aspen.greenvillelibrary.org/Search/Results?lookfor=Cien+a%C3%B1os+de+soledad&searchIndex=Keyword&searchSource=local');
  for (const bad of [{ baseUrl: 'http://aspen.greenvillelibrary.org/' }, { baseUrl: 'https://aspen.greenvillelibrary.org/Search/' }, { baseUrl: undefined }]) {
    assert.throws(() => aspenSite({ ...greenville, ...bad }), error => error.code === 'CATALOG_CONFIGURATION_REQUIRED', JSON.stringify(bad));
  }
});

test('an empty answer is an answer; anything the app cannot read is never "not found"', async () => {
  serve(fixture('greenville-research-keyword-not-held.html'));
  assert.deepEqual(await librarySearch(greenville, 'Qzxvbn Wrrtplk Mmnoqz'), []);
  const noResults = fixture('greenville-research-keyword-not-held.html');
  for (const body of ['<html><body>Server error</body></html>', '<h1>No Results Found</h1>', noResults.replace(/name="lookfor"/g, 'name="q"'),
    '<html><body><a class="result-title" href="/Record/1"> </a><input name="lookfor"></body></html>', '']) {
    clearHttpCache();
    serve(body);
    await coded(librarySearch(greenville, 'Lessons in Chemistry'), 'CATALOG_UNRECOGNIZED');
  }
});

test('walls, refusals, moves, server errors and timeouts are "couldn\'t check", and a move is never followed', async () => {
  const cases = [
    [new Response('denied', { status: 403 }), 'CATALOG_PROVIDER_BLOCKED'],
    [new Response('slow down', { status: 429 }), 'CATALOG_PROVIDER_BLOCKED'],
    [new Response('<html><title>Just a moment...</title></html>', { status: 200 }), 'CATALOG_PROVIDER_BLOCKED'],
    [new Response('<html><script src="https://x/.within.website/x/cmd/anubis/static/js/main.mjs"></script>Making sure you&#39;re not a bot!</html>', { status: 200 }), 'CATALOG_PROVIDER_BLOCKED'],
    [new Response('<html><body>hashcash proof of work</body></html>', { status: 200 }), 'CATALOG_PROVIDER_BLOCKED'],
    [new Response('', { status: 302, headers: { location: 'https://elsewhere.example/Search/Results' } }), 'CATALOG_UNAVAILABLE'],
    [new Response('oops', { status: 500 }), 'CATALOG_UNAVAILABLE'],
    [Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }), 'CATALOG_UNAVAILABLE'],
    [Object.assign(new Error('request deadline exceeded'), { name: 'AbortError' }), 'CATALOG_TIMEOUT'],
  ];
  for (const [answer, code] of cases) {
    clearHttpCache();
    const calls = serve(answer);
    await coded(librarySearch(greenville, 'Lessons in Chemistry'), code);
    assert.equal(calls.length, 1, code);
  }
  serve(fixture('greenville-research-keyword-not-held.html'));
  await coded(librarySearch(greenville, '!!! ()'), 'CATALOG_QUERY_UNSUPPORTED');
});

test('live-only: nothing is cached between checks, but two readers at once share the one request', async () => {
  const calls = serve(fixture('greenville-live-lessons-in-chemistry.html'));
  await librarySearch(getLibraryById('aspen:greenville-sc'), 'Lessons in Chemistry');
  await librarySearch(getLibraryById('aspen:greenville-sc'), 'Lessons in Chemistry');
  assert.equal(calls.length, 2);
  await Promise.all([librarySearch(getLibraryById('aspen:greenville-sc'), 'Atomic Habits'), librarySearch(getLibraryById('aspen:greenville-sc'), 'Atomic Habits')]);
  assert.equal(calls.length, 3);
});

test('the book check: the provider\'s one search finds the book, the book row first, every format kept, films and music last', async () => {
  const provider = getProvider(getLibraryById('aspen:greenville-sc'));
  assert.equal(provider.searchBy, undefined);
  serve(fixture('greenville-live-to-kill-a-mockingbird.html'));
  const found = await searchLibraryBook(provider, { title: 'To Kill a Mockingbird', authors: ['Harper Lee'] });
  assert.equal(found.outcome, 'in_catalog');
  assert.equal(found.matchKind, 'verified_work');
  // The novel's work is the first entry, once (its four formats share the work's link); the films come after every other row.
  assert.deepEqual(found.matches[0], { title: 'To kill a mockingbird', author: 'Lee, Harper', url: 'https://aspen.greenvillelibrary.org/GroupedWork/d1bb18fe-b52c-5639-374e-658952b4c5a4-eng/Home' });
  assert.equal(found.catalogUrl, found.matches[0].url);
  assert.equal(new Set(found.matches.map(match => match.url)).size, found.matches.length);

  // A scanned ISBN with no title known: the ISBN's digits are the keyword, and the work found by them is a find.
  clearHttpCache();
  const calls = serve(fixture('greenville-live-isbn-9780385547345.html'));
  const byIsbn = await searchLibraryBook(provider, { title: '' }, { readerIsbn: '9780385547345' });
  assert.equal(new URL(calls[0].url).searchParams.get('lookfor'), '9780385547345');
  assert.equal(byIsbn.matchKind, 'exact_isbn');
  assert.equal(byIsbn.matches[0].title, 'Lessons in chemistry');

  // A series title: the first book is not on the first page, but its series siblings pass the title rule (a find).
  clearHttpCache();
  serve(fixture('greenville-live-diary-of-a-wimpy-kid.html'));
  const wimpy = await searchLibraryBook(provider, { title: 'Diary of a Wimpy Kid', authors: ['Jeff Kinney'] });
  assert.equal(wimpy.outcome, 'in_catalog');
  assert.match(wimpy.matches[0].title, /^Diary of a wimpy kid/i);
  assert.equal(wimpy.matches.length, 10);

  // Nothing matching in a well-formed answer is "not found"; a failed search is not.
  clearHttpCache();
  serve(fixture('greenville-research-keyword-not-held.html'));
  assert.deepEqual(await searchLibraryBook(provider, { title: 'Qzxvbn Wrrtplk Mmnoqz' }), { outcome: 'no_match' });
  clearHttpCache();
  serve(new Response('oops', { status: 500 }));
  assert.deepEqual(await searchLibraryBook(provider, { title: 'Lessons in Chemistry' }), { outcome: 'unknown', errorCode: 'CATALOG_UNAVAILABLE' });
});

test('pacing and scope: one Aspen descriptor, each library its own host or its consortium\'s, the Crawl-delay through the robots policy', () => {
  const platform = platformFor(getLibraryById('aspen:greenville-sc'));
  assert.equal(platform.id, 'aspen');
  assert.equal(platform.results.strategy, 'search');
  assert.equal(platform.results.maxRequests, 1);
  assert.ok(platform.perMinute > 0 && platform.perMinute <= 20);
  assert.equal(hostFor(getLibraryById('aspen:greenville-sc')), 'aspen.greenvillelibrary.org');
  assert.equal(hostFor(getLibraryById('aspen:minuteman-cambridge-public-library-ma')), 'cambridge.minlib.net');
  assert.equal(hostFor(getLibraryById('aspen:minuteman-newton-free-library-ma')), 'catalog.minlib.net');
  // Every Aspen entry that may be checked can be searched as it stands.
  for (const entry of getAllLibraries().filter(item => item.platform === 'aspen' && item.capabilities?.includes('availability'))) {
    assert.equal(aspenSite(entry).origin, new URL(entry.baseUrl).origin, entry.id);
  }
});
