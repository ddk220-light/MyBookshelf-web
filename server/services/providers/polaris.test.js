import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFAULT_CTX, FORMAT_LIMIT, HITS_PER_PAGE, SEARCH_BY, SEARCH_TYPE, librarySearch, parsePolarisResults, polarisSite, readResultsPage, rowsUrl,
  searchTerm, searchUrl } from './polaris.js';
import { clearHttpCache, USER_AGENT, withCatalogOperation } from './http.js';
import { robotsAllowed, robotsRules } from './robots.js';
import { getProvider } from './index.js';
import { searchLibraryBook } from '../libraryBookSearch.js';
import { formatKind, formatTier, LAST_TIER } from '../rowFormats.js';
import { platformFor, hostFor } from '../catalog-lookup/platforms.js';
import { getAllLibraries, getLibraryById } from '../directory.js';
import { storesAvailability } from '../../catalog-store/policy.js';

// Saved Polaris PowerPAC answers (server/test/fixtures/polaris/): research
// item 4's (23 November 2026; Denver PL 8.0's full chain, and Fairfax County
// PL 8.1's broken one: a cold process.search in a new session, which answered
// "0 hits", and the rows asked for without the results page, which came back
// empty; copy, hold and facet counts are x), and the adapter's own live
// checks at both hosts (24 November 2026, as Claude-User; scripts, styles and
// action buttons cut, counts x).
const fixture = name => fs.readFileSync(new URL(`../../test/fixtures/polaris/${name}`, import.meta.url), 'utf8');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; clearHttpCache(); });

const denver = { id: 'polaris:test-denver', platform: 'polaris', baseUrl: 'https://catalog.denverlibrary.org/', polarisPath: '', polarisCtx: '1.1033.0.0.6' };
const fairfax = { id: 'polaris:test-fairfax', platform: 'polaris', baseUrl: 'https://fcplcat.fairfaxcounty.gov/', polarisPath: '', polarisCtx: '1.1033.0.0.1' };
const vendor = { id: 'polaris:test-vendor', platform: 'polaris', baseUrl: 'https://gcpl.polarislibrary.com/' };
const SESSION = ['ASP.NET_SessionId=fixture-session; path=/; secure; HttpOnly; SameSite=Lax', 'OrgID=1; path=/; secure; HttpOnly', '__AntiXsrfToken=fixture-token; path=/; secure; HttpOnly'];
// The Location headers PowerPAC answered (research item 4; the live checks had the same shape).
const hrefOf = html => html.match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&');

function html(body, { status = 200, location, cookies = [] } = {}) {
  const headers = new Headers({ 'content-type': 'application/xhtml+xml; charset=utf-8' });
  if (location) headers.set('location', location);
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(body, { status, headers });
}
// PowerPAC's chain for one search: the search (302, the session), process.search (302), the results page, its rows.
const chain = (origin, { results, rows, first = fixture('denver-8.0-1-searchresults-302.html'), second = fixture('denver-8.0-2-process-search-302.html') } = {}) => [
  html(first, { status: 302, location: hrefOf(first).replace('https://catalog.denverlibrary.org', origin), cookies: SESSION }),
  html(second, { status: 302, location: hrefOf(second) }),
  html(results),
  ...(rows === undefined ? [] : [html(rows)]),
];
function serve(answers) {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    const answer = answers[calls.length - 1];
    if (!answer) throw new Error(`unexpected request ${calls.length}: ${url}`);
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return calls;
}
const coded = async (promise, code) => assert.rejects(promise, error => error.code === code);

test('one keyword search is PowerPAC\'s own chain: the search, process.search, the results page and its rows, in one session', async () => {
  const calls = serve(chain('https://catalog.denverlibrary.org', { results: fixture('denver-8.0-3-results-shell.html'), rows: fixture('denver-8.0-4-ajaxresults-page1-rows.html') }));
  const rows = await librarySearch(denver, 'Remarkably Bright Creatures');
  assert.deepEqual(calls.map(call => call.url), [
    'https://catalog.denverlibrary.org/search/searchresults.aspx?ctx=1.1033.0.0.6&type=Keyword&term=Remarkably%20Bright%20Creatures&by=KW&sort=RELEVANCE&limit=TOM=*&query=&page=0',
    'https://catalog.denverlibrary.org/process.search?cmd=FIND&url=search%2fsearchresults.aspx%3fctx%3d1.1033.0.0.6%26type%3dKeyword%26term%3dRemarkably%2bBright%2bCreatures%26by%3dKW%26sort%3dRELEVANCE%26limit%3dTOM%253d*%26query%3d%26page%3d0%26searchid%3d1&max=10&vhc=303918007',
    'https://catalog.denverlibrary.org/search/searchresults.aspx?ctx=1.1033.0.0.6&type=Keyword&term=Remarkably%20Bright%20Creatures&by=KW&sort=RELEVANCE&limit=TOM=*&query=&page=0&searchid=1',
    `https://catalog.denverlibrary.org/search/components/ajaxResults.aspx?page=1&hpp=${HITS_PER_PAGE}`,
  ]);
  assert.deepEqual([SEARCH_TYPE, SEARCH_BY, FORMAT_LIMIT, HITS_PER_PAGE], ['Keyword', 'KW', 'TOM=*', 50]);
  // The first request carries no cookie; every later one the session the first set, and nothing else.
  assert.equal(calls[0].options.headers.Cookie, undefined);
  for (const call of calls.slice(1)) assert.equal(call.options.headers.Cookie, 'ASP.NET_SessionId=fixture-session; OrgID=1; __AntiXsrfToken=fixture-token');
  for (const call of calls) {
    assert.equal(call.options.method ?? 'GET', 'GET');
    assert.equal(call.options.redirect, 'manual');
    assert.equal(call.options.headers['User-Agent'], USER_AGENT);
    assert.match(call.options.headers['Accept-Language'], /^en/);
  }
  // Research item 4's rows (open/4-polaris/rows.tsv): ten of 14 hits, five formats of the novel first.
  assert.equal(rows.length, 10);
  assert.deepEqual(rows[0], { recordId: '2320085', title: 'Remarkably bright creatures : a novel', authors: ['Van Pelt, Shelby'], isbns: ['9780063204157'],
    format: 'Book', catalogUrl: 'https://catalog.denverlibrary.org/search/title.aspx?ctx=1.1033.0.0.6&cn=2320085', catalogLinkKind: 'record' });
  assert.deepEqual(rows.slice(0, 5).map(row => row.format), ['Book', 'Eaudiobook', 'Ebook', 'Large Print', 'Playaway']);
  assert.deepEqual(rows.map(row => row.recordId), ['2320085', '2343179', '2343215', '2355776', '2683890', '2500743', '2860698', '2860559', '2608667', '2629497']);
  for (const row of rows) assert.doesNotMatch(row.catalogUrl, /pos=|term=/);
});

test('Fairfax 8.1 answers the same chain once the session carries through: rows, e-content formats past the vendor logo', async () => {
  const fx = 'https://fcplcat.fairfaxcounty.gov';
  serve(chain(fx, { first: fixture('fairfax-8.1-1-searchresults-302.html'), results: fixture('fairfax-live-remarkably-bright-creatures-results.html'),
    rows: fixture('fairfax-live-remarkably-bright-creatures-rows.html') }));
  const rows = await librarySearch(fairfax, 'Remarkably Bright Creatures');
  assert.equal(rows.length, 11);
  assert.deepEqual(rows.slice(0, 5).map(row => [row.format, row.recordId, row.isbns[0]]), [
    ['Book', '538464', '9780063204157'], ['Audio Book on CD', '538734', '9798200969272'], ['Ebook', '544581', '9780063204171'],
    ['Eaudiobook', '545381', '9780063204188'], ['Large Print', '559227', '9780063242401']]);
  // OverDrive rows show the vendor's logo before their format icon; the logo is not a format.
  assert.equal(rows.some(row => /overdrive/i.test(row.format)), false);
  assert.equal(rows[2].catalogUrl, 'https://fcplcat.fairfaxcounty.gov/search/title.aspx?ctx=1.1033.0.0.1&cn=544581');
  // Fifty rows a page (Lessons in Chemistry: 46 hits), every format kept: a book group kit too.
  const many = parsePolarisResults(fixture('fairfax-live-lessons-in-chemistry-rows.html'), polarisSite(fairfax));
  assert.equal(many.length, 46);
  assert.deepEqual(many.slice(0, 6).map(row => row.format), ['Book', 'Ebook', 'Eaudiobook', 'Kit', 'Audio Book on CD', 'Large Print']);
  for (const row of many) assert.ok(row.title && /^\d+$/.test(row.recordId) && row.catalogUrl.startsWith(`${fx}/search/title.aspx?`), row.title);
  // A record without a cover ISBN has none; accents are kept.
  const cien = parsePolarisResults(fixture('fairfax-live-cien-anos-de-soledad-rows.html'), polarisSite(fairfax));
  assert.deepEqual(cien.slice(0, 2).map(row => [row.title, row.isbns]), [['Cien años de soledad', ['9788439735991']], ['Cien años de soledad', []]]);
});

test('titles read as the catalog shows them: matched words are their own spans, punctuation stays joined', () => {
  const rows = parsePolarisResults(fixture('denver-live-oh-the-places-rows.html'), polarisSite(denver));
  assert.equal(rows.length, 14);
  assert.deepEqual(rows.slice(0, 3).map(row => [row.title, row.authors[0], row.format]), [
    ['Oh, the places you\'ll go! : and The Lorax', 'Seuss, Dr', 'Eaudiobook'], ['Oh, the places you\'ll go!', 'Seuss, Dr', 'Book'], ['Oh, the places you\'ll go!', 'Seuss, Dr', 'Ebook']]);
  const wimpy = parsePolarisResults(fixture('denver-live-diary-of-a-wimpy-kid-rows.html'), polarisSite(denver));
  assert.equal(wimpy.length, 50);
  // The catalog's first row is an Arabic edition, its title in both scripts (the ranking puts the English book rows first).
  assert.match(wimpy[0].title.normalize('NFC'), /^مذكرات طالب: رحلة الاحلام \/ Mudhakarr/);
  assert.ok(wimpy.some(row => row.format === 'Read-along'));
});

test('"No titles found" is not found; an ISBN with no hits is not absence; an empty or broken chain is never "not found"', async () => {
  // A nonsense term at Denver: three requests, no rows asked for.
  let calls = serve(chain('https://catalog.denverlibrary.org', { results: fixture('denver-live-no-hits-results.html') }));
  assert.deepEqual(await librarySearch(denver, 'Qzxvbn Wrrtplk Mmnoqz'), []);
  assert.equal(calls.length, 3);
  // Fairfax's keyword index has no ISBNs: "No titles found" for a book it lists (live check, 24 November 2026).
  clearHttpCache();
  serve(chain('https://fcplcat.fairfaxcounty.gov', { results: fixture('fairfax-live-isbn-9780385547345-no-hits-results.html') }));
  await coded(librarySearch(fairfax, '9780385547345'), 'CATALOG_QUERY_UNSUPPORTED');
  // Research item 4: the cold process.search started a new session and answered "0 hits". A changed session is couldn't check.
  clearHttpCache();
  const answers = chain('https://fcplcat.fairfaxcounty.gov', { results: fixture('fairfax-8.1-3-results-shell-0-hits-after-cold-process-search.html') });
  answers[1] = html(fixture('denver-8.0-2-process-search-302.html'), { status: 302, location: hrefOf(fixture('denver-8.0-2-process-search-302.html')),
    cookies: ['ASP.NET_SessionId=another-session; path=/; HttpOnly'] });
  calls = serve(answers);
  await coded(librarySearch(fairfax, 'Remarkably Bright Creatures'), 'CATALOG_UNRECOGNIZED');
  assert.equal(calls.length, 2);
  // No session at all: couldn't check before the search runs.
  clearHttpCache();
  const first = fixture('denver-8.0-1-searchresults-302.html');
  serve([html(first, { status: 302, location: hrefOf(first) })]);
  await coded(librarySearch(denver, 'Remarkably Bright Creatures'), 'CATALOG_UNRECOGNIZED');
  // The rows asked for without their results page came back empty (research item 4): couldn't check, never [].
  clearHttpCache();
  serve(chain('https://fcplcat.fairfaxcounty.gov', { results: fixture('fairfax-live-remarkably-bright-creatures-results.html'), rows: fixture('fairfax-8.1-4-ajaxresults-empty-shell-skipped.html') }));
  await coded(librarySearch(fairfax, 'Remarkably Bright Creatures'), 'CATALOG_UNRECOGNIZED');
  // A results page the app does not recognise, a count with no rows, a redirect where rows belong.
  for (const [results, rows] of [['<html><body>Welcome</body></html>', undefined],
    [fixture('denver-8.0-3-results-shell.html'), '<div class="c-results-utility-result-count">1 - 10 of 14</div><div id="searchResultsDIV"></div>'],
    [fixture('denver-8.0-3-results-shell.html'), html('', { status: 302, location: '/logon.aspx' })]]) {
    clearHttpCache();
    const list = chain('https://catalog.denverlibrary.org', { results, rows: typeof rows === 'string' ? rows : undefined });
    if (rows instanceof Response) list.push(rows);
    serve(list);
    await coded(librarySearch(denver, 'Remarkably Bright Creatures'), 'CATALOG_UNRECOGNIZED');
  }
  assert.equal(readResultsPage(fixture('denver-8.0-3-results-shell.html')), 'rows');
  assert.equal(readResultsPage(fixture('fairfax-live-isbn-9780385547345-no-hits-results.html')), 'none');
});

test('walls, refusals, moves and server errors are "couldn\'t check", at any step; a move is never followed', async () => {
  const denverChain = () => chain('https://catalog.denverlibrary.org', { results: fixture('denver-8.0-3-results-shell.html'), rows: fixture('denver-8.0-4-ajaxresults-page1-rows.html') });
  const cases = [
    [0, html('denied', { status: 403 }), 'CATALOG_PROVIDER_BLOCKED'],
    [0, html('slow down', { status: 429 }), 'CATALOG_PROVIDER_BLOCKED'],
    [2, html('<html><title>Just a moment...</title><script src="/cdn-cgi/challenge-platform/x"></script></html>'), 'CATALOG_PROVIDER_BLOCKED'],
    [3, html('<html><script src="https://x/.within.website/x/cmd/anubis/static/js/main.mjs"></script></html>'), 'CATALOG_PROVIDER_BLOCKED'],
    [1, html('', { status: 302, location: 'https://elsewhere.example/search/searchresults.aspx' }), 'CATALOG_UNAVAILABLE'],
    [2, html('oops', { status: 500 }), 'CATALOG_UNAVAILABLE'],
    [3, html('oops', { status: 503 }), 'CATALOG_UNAVAILABLE'],
    [0, Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }), 'CATALOG_UNAVAILABLE'],
    [1, Object.assign(new Error('request deadline exceeded'), { name: 'AbortError' }), 'CATALOG_TIMEOUT'],
  ];
  for (const [step, answer, code] of cases) {
    clearHttpCache();
    const answers = denverChain();
    answers[step] = answer;
    const calls = serve(answers);
    await coded(librarySearch(denver, 'Remarkably Bright Creatures'), code);
    assert.equal(calls.length, step + 1, `${code} at ${step}`);
  }
  await coded(librarySearch(denver, '!!! ()'), 'CATALOG_QUERY_UNSUPPORTED');
});

test('robots.txt is read for every request, literally: the vendor template\'s capital-P rule leaves /polaris/ open, and a redirect into a disallowed path is never sent', async () => {
  // Polaris's 387-byte vendor template, as gcpl.polarislibrary.com served it (research, 23 November 2026).
  const template = robotsRules(['User-agent: *', 'Disallow: /Mobile/', ...['addons', 'children', 'dashboards', 'patronaccount', 'payments', 'rss', 'scripts', 'search',
    'services', 'themes', 'usercontrols', 'xsl'].map(dir => `Disallow: /Polaris/${dir}/`)].join('\n'));
  const robots = async url => ({ allowed: robotsAllowed(template, url), delayMs: template.delay * 1000 });
  const site = polarisSite(vendor);
  assert.deepEqual(site, { origin: 'https://gcpl.polarislibrary.com', path: '/polaris', ctx: DEFAULT_CTX });
  assert.equal(searchUrl(site, 'Atomic Habits'), 'https://gcpl.polarislibrary.com/polaris/search/searchresults.aspx?ctx=1.1033.0.0.1&type=Keyword&term=Atomic%20Habits&by=KW&sort=RELEVANCE&limit=TOM=*&query=&page=0');
  assert.equal(robotsAllowed(template, searchUrl(site, 'Atomic Habits')), true);
  assert.equal(robotsAllowed(template, searchUrl(site, 'Atomic Habits').replace('/polaris/', '/Polaris/')), false);
  // The rows sit beside the results page, wherever the server put it.
  assert.equal(rowsUrl('https://gcpl.polarislibrary.com/polaris/search/searchresults.aspx?ctx=1&searchid=1'), `https://gcpl.polarislibrary.com/polaris/search/components/ajaxResults.aspx?page=1&hpp=${HITS_PER_PAGE}`);
  // The server's own redirect into /Polaris/search/ stops the check there.
  const first = fixture('denver-8.0-1-searchresults-302.html');
  const calls = serve([
    html(first, { status: 302, location: 'https://gcpl.polarislibrary.com/polaris/process.search?cmd=FIND&vhc=1', cookies: SESSION }),
    html('', { status: 302, location: '/Polaris/search/searchresults.aspx?ctx=1.1033.0.0.1&searchid=1' }),
  ]);
  await assert.rejects(withCatalogOperation({ robots }, () => librarySearch(vendor, 'Atomic Habits')), error => error.code === 'CATALOG_PROVIDER_BLOCKED' && error.robots === true);
  assert.deepEqual(calls.map(call => new URL(call.url).pathname), ['/polaris/search/searchresults.aspx', '/polaris/process.search']);
});

test('the term is plain words; the entry gives the origin, the path its pages link and its context', () => {
  assert.equal(searchTerm('Oh, the Places You\'ll Go!'), 'Oh the Places You\'ll Go');
  assert.equal(searchTerm('author: "Kinney" -wimpy Spider-Man [a TO z] (x) ~y* ? 50% #1; a&b'), 'author Kinney wimpy Spider-Man a TO z x y 50 1 a b');
  assert.equal(searchUrl(polarisSite(fairfax), 'Cien años de soledad'),
    'https://fcplcat.fairfaxcounty.gov/search/searchresults.aspx?ctx=1.1033.0.0.1&type=Keyword&term=Cien%20a%C3%B1os%20de%20soledad&by=KW&sort=RELEVANCE&limit=TOM=*&query=&page=0');
  for (const bad of [{ baseUrl: 'http://catalog.denverlibrary.org/' }, { baseUrl: 'https://catalog.denverlibrary.org/polaris/' }, { baseUrl: undefined },
    { polarisPath: '/Polaris' }, { polarisPath: '/polaris/' }, { polarisCtx: '1.1033.0.0.6&x=1' }, { polarisCtx: 'abc' }]) {
    assert.throws(() => polarisSite({ ...denver, ...bad }), error => error.code === 'CATALOG_CONFIGURATION_REQUIRED', JSON.stringify(bad));
  }
});

test('the book check: the provider\'s one search finds the book, the book row first, every format kept, e-content after print', async () => {
  const provider = getProvider(getLibraryById('polaris:denver-co'));
  assert.equal(provider.searchBy, undefined);
  serve(chain('https://catalog.denverlibrary.org', { results: fixture('denver-8.0-3-results-shell.html'), rows: fixture('denver-8.0-4-ajaxresults-page1-rows.html') }));
  const found = await searchLibraryBook(provider, { title: 'Remarkably Bright Creatures', authors: ['Shelby Van Pelt'], isbn13: '9780063204157' });
  assert.equal(found.outcome, 'in_catalog');
  assert.equal(found.matches[0].url, 'https://catalog.denverlibrary.org/search/title.aspx?ctx=1.1033.0.0.6&cn=2320085');
  assert.equal(found.matches.length, 5);
  // A scanned ISBN with no title known: Denver's keyword index finds it.
  clearHttpCache();
  const calls = serve(chain('https://catalog.denverlibrary.org', { results: fixture('denver-8.0-3-results-shell.html'), rows: fixture('denver-live-isbn-9780385547345-rows.html') }));
  const byIsbn = await searchLibraryBook(provider, { title: '' }, { readerIsbn: '9780385547345' });
  assert.match(calls[0].url, /&term=9780385547345&/);
  assert.equal(byIsbn.matchKind, 'exact_isbn');
  assert.equal(byIsbn.matches[0].title, 'Lessons in chemistry : a novel');
  // Fairfax's does not: couldn't check, never "not found".
  clearHttpCache();
  serve(chain('https://fcplcat.fairfaxcounty.gov', { results: fixture('fairfax-live-isbn-9780385547345-no-hits-results.html') }));
  assert.equal((await searchLibraryBook(getProvider(getLibraryById('polaris:fairfax-county-va')), { title: '' }, { readerIsbn: '9780385547345' })).outcome, 'unknown');
  // A series title: its siblings pass the title rule; ten rows on the card.
  clearHttpCache();
  serve(chain('https://catalog.denverlibrary.org', { results: fixture('denver-8.0-3-results-shell.html'), rows: fixture('denver-live-diary-of-a-wimpy-kid-rows.html') }));
  const wimpy = await searchLibraryBook(provider, { title: 'Diary of a Wimpy Kid', authors: ['Jeff Kinney'] });
  assert.equal(wimpy.outcome, 'in_catalog');
  assert.match(wimpy.matches[0].title, /^Diary of a wimpy kid/i);
  assert.equal(wimpy.matches.length, 10);
  // Nothing found is "not found".
  clearHttpCache();
  serve(chain('https://catalog.denverlibrary.org', { results: fixture('denver-live-no-hits-results.html') }));
  assert.deepEqual(await searchLibraryBook(provider, { title: 'Qzxvbn Wrrtplk Mmnoqz' }), { outcome: 'no_match' });
});

test('storage: Denver, Fairfax and Riverside may keep an answer; every other Polaris library asks again each time', async () => {
  for (const id of ['polaris:denver-co', 'polaris:fairfax-county-va', 'polaris:riverside-ca']) assert.equal(storesAvailability(id), true, id);
  const polaris = getAllLibraries().filter(entry => entry.platform === 'polaris');
  assert.ok(polaris.length > 300);
  for (const entry of polaris.filter(item => !['polaris:denver-co', 'polaris:fairfax-county-va', 'polaris:riverside-ca'].includes(item.id))) {
    assert.equal(storesAvailability(entry.id), false, entry.id);
  }
  const answers = () => chain('https://catalog.denverlibrary.org', { results: fixture('denver-8.0-3-results-shell.html'), rows: fixture('denver-8.0-4-ajaxresults-page1-rows.html') });
  let calls = serve([...answers(), ...answers()]);
  await librarySearch(getLibraryById('polaris:denver-co'), 'Remarkably Bright Creatures');
  await librarySearch(getLibraryById('polaris:denver-co'), 'Remarkably Bright Creatures');
  assert.equal(calls.length, 4);
  clearHttpCache();
  const carroll = { ...getLibraryById('polaris:carroll-county-md'), baseUrl: 'https://catalog.denverlibrary.org/' };
  calls = serve([...answers(), ...answers()]);
  await librarySearch(carroll, 'Remarkably Bright Creatures');
  await librarySearch(carroll, 'Remarkably Bright Creatures');
  assert.equal(calls.length, 8);
});

test('pacing and formats: one Polaris descriptor, a host per catalog, four requests a check; every label seen read as its kind', () => {
  const platform = platformFor(getLibraryById('polaris:denver-co'));
  assert.equal(platform.id, 'polaris');
  assert.equal(platform.results.strategy, 'search');
  assert.ok(platform.results.maxRequests >= 4);
  assert.ok(platform.perMinute > 0 && platform.perMinute <= 60);
  assert.equal(hostFor(getLibraryById('polaris:denver-co')), 'catalog.denverlibrary.org');
  assert.equal(hostFor(getLibraryById('polaris:share-decatur-public-library-il')), 'search.illinoisheartland.org');
  for (const entry of getAllLibraries().filter(item => item.platform === 'polaris')) {
    const site = polarisSite(entry);
    assert.equal(site.origin, new URL(entry.baseUrl).origin, entry.id);
    assert.equal(entry.polarisPath, site.path, entry.id);
  }
  const seen = { Book: 'book', 'Large Print': 'book', 'Read-along': 'book', Ebook: 'ebook', 'Electronic Resources': 'ebook', Eaudiobook: 'audiobook',
    'Audio Book on CD': 'audiobook', Playaway: 'audiobook', Kit: 'other' };
  for (const [label, kind] of Object.entries(seen)) assert.equal(formatKind(label), kind, label);
  assert.deepEqual(['Book', 'Ebook', 'Kit', 'DVD', 'Music CD', 'Blu-Ray Disc', 'Printed music'].map(format => formatTier({ format })), [0, 1, 2, LAST_TIER, LAST_TIER, LAST_TIER, LAST_TIER]);
});

test('a results page that loads its rows is read for them even where it also says "No titles found": only a page with no rows is not found', () => {
  const page = fs.readFileSync(new URL('../../test/fixtures/polaris/fairfax-live-remarkably-bright-creatures-results.html', import.meta.url), 'utf8');
  assert.equal(readResultsPage(page), 'rows');
  // A template or message elsewhere on the page with those words does not make the search empty.
  const marked = page.replace('</body>', '<script type="text/template" id="empty">No titles found (0 hits)</script><div hidden>No titles found</div></body>');
  assert.notEqual(marked, page);
  assert.equal(readResultsPage(marked), 'rows');
  const none = fs.readFileSync(new URL('../../test/fixtures/polaris/denver-live-no-hits-results.html', import.meta.url), 'utf8');
  assert.equal(readResultsPage(none), 'none');
});
