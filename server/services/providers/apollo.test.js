import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KNOWN_SCRIPTS, SEARCH_TYPE, VERSION_TTL_MS, apolloSite, catalogVersion, clearApolloVersions, librarySearch, parseApolloResults, parseSearchId,
  recordUrl, scriptOf, searchBody, searchTerm, setupUrl, versionOf } from './apollo.js';
import { clearHttpCache, USER_AGENT, withCatalogOperation } from './http.js';
import { robotsAllowed, robotsRules } from './robots.js';
import { getProvider } from './index.js';
import { searchLibraryBook, titleMatches } from '../libraryBookSearch.js';
import { formatKind, formatTier, LAST_TIER } from '../rowFormats.js';
import { platformFor, hostFor } from '../catalog-lookup/platforms.js';
import { getAllLibraries, getLibraryById } from '../directory.js';
import { storesAvailability } from '../../catalog-store/policy.js';

// Saved Apollo answers (server/test/fixtures/apollo/): research item 8's (23
// November 2026; Clear Lake PL IA and Lawton PL OK: "to kill a mockingbird",
// a title search and its branch-limited twin, a search with no hits) and the
// adapter's own live checks at both hosts (24 November 2026, as Claude-User);
// item holdings (barcodes, per-copy availability) cut. The catalog page and
// script are excerpts: the page's head and the end where it names its script,
// and the start of the script's ApolloCatalog, where it sets the version.
const fixture = name => fs.readFileSync(new URL(`../../test/fixtures/apollo/${name}`, import.meta.url), 'utf8');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; clearHttpCache(); clearApolloVersions(); });

const clearLake = { id: 'apollo:test-clear-lake', platform: 'apollo', baseUrl: 'https://cllibrary.biblionix.com/' };
const lawton = { id: 'apollo:test-lawton', platform: 'apollo', baseUrl: 'https://lawton.biblionix.com/' };
const KNOWN = Object.keys(KNOWN_SCRIPTS)[0];
const PAGE = fixture('lawton-live-catalog-page-excerpt.html');
const pageWith = script => PAGE.replace(KNOWN, script);

function answer(body, { status = 200, type = 'text/xml; charset=utf-8', location } = {}) {
  const headers = new Headers({ 'content-type': type });
  if (location) headers.set('location', location);
  return new Response(body, { status, headers });
}
const page = (body = PAGE) => answer(body, { type: 'text/html; charset=UTF-8' });
const setup = (id = 1163163419) => answer(`<root search_id="${id}"></root>`);
function serve(answers) {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    const next = answers[calls.length - 1];
    if (!next) throw new Error(`unexpected request ${calls.length}: ${url}`);
    if (next instanceof Error) throw next;
    return next;
  };
  return calls;
}
const coded = async (promise, code) => assert.rejects(promise, error => error.code === code);

test('one keyword search is Apollo\'s own two plain requests, after the catalog page that names the version\'s script', async () => {
  const calls = serve([page(), setup(), answer(fixture('clearlake-live-remarkably-bright-creatures.xml'))]);
  const rows = await librarySearch(clearLake, 'Remarkably Bright Creatures');
  assert.deepEqual(calls.map(call => [call.options.method ?? 'GET', call.url]), [
    ['GET', 'https://cllibrary.biblionix.com/catalog/'],
    ['GET', 'https://cllibrary.biblionix.com/catalog/ajax_backend/search_setup.xml.pl?search=keyword%3ARemarkably%20Bright%20Creatures'],
    ['POST', 'https://cllibrary.biblionix.com/catalog/ajax_backend/perform_search.xml.pl'],
  ]);
  assert.equal(SEARCH_TYPE, 'keyword');
  // The search ID from the first answer and the version the page's script sets; no branch, no cookie, no redirect followed.
  assert.equal(calls[2].options.body, '{"search_id":1163163419,"catalog_version":"2026-01-16.01"}');
  assert.equal(calls[2].options.headers['Content-Type'], 'application/json');
  for (const call of calls) {
    assert.equal(call.options.redirect, 'manual');
    assert.equal(call.options.headers['User-Agent'], USER_AGENT);
    assert.equal(call.options.headers.Cookie, undefined);
  }
  // 28 records, the novel first in four formats: Playaway, print (no medium), Libby e-book and e-audiobook.
  assert.equal(rows.length, 28);
  assert.deepEqual(rows.slice(0, 4).map(row => [row.title, row.format ?? null]), [
    ['Remarkably bright creatures', 'Playaway'], ['Remarkably bright creatures: a novel', null],
    ['Remarkably Bright Creatures: A Novel', 'eBook'], ['Remarkably Bright Creatures: A Novel', 'Audiobook']]);
  assert.deepEqual(rows[1], { recordId: '551894303', title: 'Remarkably bright creatures: a novel', authors: ['Van Pelt, Shelby'], isbns: [],
    catalogUrl: 'https://cllibrary.biblionix.com/catalog/?search_biblio=551894303', catalogLinkKind: 'record' });
  // The catalog page is read once a day per host: the next search is the two requests only.
  clearHttpCache();
  const again = serve([setup(1163163571), answer(fixture('clearlake-live-charlottes-web.xml'))]);
  assert.equal((await librarySearch(clearLake, 'Charlotte\'s Web')).length, 80);
  assert.equal(again.length, 2);
  assert.match(again[1].options.body, /"catalog_version":"2026-01-16\.01"/);
});

test('titles and authors read as the catalog shows them: soft hyphens gone, entities decoded, the leading article in front', () => {
  const raw = fixture('clearlake-8-to-kill-a-mockingbird.xml');
  // Apollo puts soft hyphens inside words; without removing them the title rule finds nothing.
  assert.ok((raw.match(/\u00ad/g) || []).length > 100);
  const soft = raw.match(/<s [^>]*\bt="([^"]*)"/)[1];
  assert.equal(soft, 'To kil\u00adl a \u00admock\u00ading\u00adbird');
  assert.equal(titleMatches(soft, 'To Kill a Mockingbird'), false);
  const rows = parseApolloResults(raw, apolloSite(clearLake));
  assert.equal(rows.length, 37);
  for (const row of rows) assert.doesNotMatch(`${row.title} ${row.authors.join(' ')}`, /\u00ad|&#|&amp;/, row.title);
  assert.deepEqual(rows.slice(0, 4).map(row => [row.title, row.authors[0] ?? null, row.format ?? null]), [
    ['To kill a mockingbird', 'Lee, Harper', null], ['To kill a mockingbird', 'Lee, Harper', 'sound recording'],
    ['To kill a mockingbird', 'Lee, Harper', 'large print'], ['To kill a mockingbird', null, 'videorecording']]);
  assert.ok(titleMatches(rows[0].title, 'To Kill a Mockingbird'));
  assert.ok(rows.some(row => row.title === 'Tru & Nelle') && rows.some(row => row.title === 'The Children\'s Story'));
  const lawtonRows = parseApolloResults(fixture('lawton-8-to-kill-a-mockingbird.xml'), apolloSite(lawton));
  assert.ok(lawtonRows.some(row => row.title === 'Racism in Harper Lee\'s To kill a mockingbird'));
  // The catalog keeps "The" apart (l="The"); the row's title has it in front, as the catalog page shows it.
  const charlotte = parseApolloResults(fixture('clearlake-live-charlottes-web.xml'), apolloSite(clearLake));
  assert.ok(charlotte.some(row => row.title.startsWith('The story of Charlotte\'s Web: E. B. White\'s eccentric life')));
  assert.ok(charlotte.every(row => !/^(?:the|an?) /i.test(row.title) || /^(?:The|A|An) /.test(row.title)));
});

test('a record is the library\'s when its own holdings list owns it or its outside provider lends it; a record listed twice is one row', () => {
  // Lawton: the novel is listed twice (Fiction and Young Adult shelves) under one record: one row. 46 listed, 45 records.
  const rows = parseApolloResults(fixture('lawton-8-to-kill-a-mockingbird.xml'), apolloSite(lawton));
  assert.equal(rows.length, 45);
  assert.equal(rows.filter(row => row.recordId === '270748142').length, 1);
  // Libby rows (OverDrive, e="overdrive_api", <ol o="0">) count: Apollo's own page counts them as the library's.
  assert.deepEqual(rows.filter(row => row.recordId === '1531782985').map(row => [row.title, row.format]), [['To Kill a Mockingbird', 'eBook']]);
  const wimpy = parseApolloResults(fixture('lawton-live-diary-of-a-wimpy-kid.xml'), apolloSite(lawton));
  assert.equal(wimpy.length, 162);
  // A record the library's own list does not own, with no outside provider, is not the library's; nor one another library's list owns.
  const site = apolloSite(lawton);
  const row = (b, inner, e = '') => `<s b="${b}" o="0" t="Lessons in chemistry" l="" a="Garmus, Bonnie" ani="" m="" ms="" e="${e}">${inner}</s>`;
  const xml = rows => `<root sort="score" > <result description="Keyword: x" matches="3" command="keyword:x" filter="" /><null> </null>${rows}</root>`;
  assert.deepEqual(parseApolloResults(xml([row(1, '<ol id="0" o="0" t="0" b="1"></ol>'), row(2, '<ol id="42" o="1" t="1" b="9"></ol>'),
    row(3, '<ol o="1" id="0" t="1" b="3"><br id="5" in="1"></br></ol>')].join('')), site).map(item => item.recordId), ['3']);
  assert.deepEqual(parseApolloResults(xml(row(4, '<ol o="0" id="0" t="0" ></ol>', 'overdrive_api')), site).map(item => item.recordId), ['4']);
  // An outside provider's title with no downloadable kind ranks with the e-books; with one, as that kind.
  const libby = (m, ms) => parseApolloResults(xml(row(5, '<ol o="0" id="0" t="0" ></ol>', 'overdrive_api').replace('m="" ms=""', `m="${m}" ms="${ms}"`)), site)[0];
  assert.deepEqual([formatTier(libby('Libby', '')), libby('Libby', '').format], [1, 'Libby']);
  assert.deepEqual([formatTier(libby('Libby Audiobook', 'Audiobook')), libby('Libby Audiobook', 'Audiobook').formatKind], [1, undefined]);
  assert.equal(formatTier(libby('Libby Magazine', 'Magazine')), 2);
  // Only records the app cannot read as this library's (none its own, none an outside provider's): couldn't check, never
  // not found (pre-release review, 24 November 2026: a holdings list in another shape must not turn every search into absence).
  assert.throws(() => parseApolloResults(xml(row(1, '<ol id="0" o="0" t="0" b="1"></ol>')), site), { code: 'CATALOG_UNRECOGNIZED' });
  assert.throws(() => parseApolloResults(xml(row(2, '<ol id="42" o="1" t="1" b="9"></ol>')), site), { code: 'CATALOG_UNRECOGNIZED' });
  assert.throws(() => parseApolloResults(xml(row(3, '<holdings owned="yes"></holdings>')), site), { code: 'CATALOG_UNRECOGNIZED' });
});

test('no hits is not found; an answer the app cannot read is never "not found"', async () => {
  const site = apolloSite(clearLake);
  assert.deepEqual(parseApolloResults(fixture('clearlake-live-no-hits.xml'), site), []);
  assert.deepEqual(parseApolloResults(fixture('clearlake-8-pather-panchali-no-hits.xml'), site), []);
  const calls = serve([page(), setup(1163163875), answer(fixture('clearlake-live-no-hits.xml'))]);
  assert.deepEqual(await librarySearch(clearLake, 'Qzxvbn Wrrtplk Mmnoqz'), []);
  assert.equal(calls.length, 3);
  const head = '<root sort="score" > <result description="Keyword: x" matches="5" command="keyword:x" filter="" /><null></null>';
  for (const broken of ['<html><body>Sorry</body></html>', '', `${head}</root>`, head + fixture('clearlake-live-no-hits.xml').slice(0, 10),
    '<root sort="score"><null></null></root>', `${head}<s b="1" t="" a=""><ol id="0" o="1"></ol></s></root>`,
    fixture('clearlake-live-remarkably-bright-creatures.xml').slice(0, 9000)]) {
    assert.throws(() => parseApolloResults(broken, site), error => error.code === 'CATALOG_UNRECOGNIZED', broken.slice(0, 60));
  }
  assert.equal(parseSearchId(fixture('clearlake-8-setup-to-kill-a-mockingbird.xml')), 1162875132);
  for (const broken of ['<root></root>', '<root search_id=""></root>', '<html>', '<root search_id="12a"></root>']) {
    assert.throws(() => parseSearchId(broken), error => error.code === 'CATALOG_UNRECOGNIZED', broken);
  }
  // A setup answer without a search, or a catalog page that names no script, is couldn't check before any search.
  serve([page(), answer('<root></root>')]);
  await coded(librarySearch(lawton, 'Lessons in Chemistry'), 'CATALOG_UNRECOGNIZED');
  clearApolloVersions();
  const pageOnly = serve([page('<html><head><title>Catalog</title></head><body></body></html>')]);
  await coded(librarySearch(lawton, 'Lessons in Chemistry'), 'CATALOG_UNRECOGNIZED');
  assert.equal(pageOnly.length, 1);
});

test('the catalog version is read from the script the catalog page names, kept for a day, and read again when a kept one gets an unreadable answer', async () => {
  // The page names the script; a script read once is kept by its name (its content's hash).
  assert.equal(scriptOf(PAGE), KNOWN);
  assert.equal(versionOf(fixture('apollo-js-min-excerpt.js')), '2026-01-16.01');
  assert.equal(versionOf('var x={version:"9"}; this.version=\'1\''), null);
  assert.equal(versionOf('function ApolloCatalog(a){"use strict";var that=this;this.version=\'bad value!\';'), null);
  // A script not seen before is read once, for its version.
  const next = 'js-min_00000000000000000000000000000000000000000000000000000000000000aa.js';
  const script = fixture('apollo-js-min-excerpt.js').replace('2026-01-16.01', '2027-03-01.02');
  let calls = serve([page(pageWith(next)), answer(script, { type: 'text/javascript' }), setup(), answer(fixture('lawton-live-lessons-in-chemistry.xml'))]);
  assert.equal((await librarySearch(lawton, 'Lessons in Chemistry')).length, 28);
  assert.equal(calls[1].url, `https://lawton.biblionix.com/catalog/optimized/${next}`);
  assert.match(calls[3].options.body, /"catalog_version":"2027-03-01\.02"/);
  // Another host naming the same script: its page only.
  calls = serve([page(pageWith(next)), setup(), answer(fixture('clearlake-live-no-hits.xml'))]);
  await librarySearch(clearLake, 'Qzxvbn');
  assert.equal(calls.length, 3);
  // Kept for a day on this instance; after that, the page is read again.
  const site = apolloSite(lawton);
  assert.equal((await catalogVersion(site, Date.now() + 1000)).fresh, false);
  calls = serve([page()]);
  const later = await catalogVersion(site, Date.now() + 1000, { now: Date.now() + VERSION_TTL_MS + 1 });
  assert.deepEqual([later.version, later.fresh, calls.length], ['2026-01-16.01', true, 1]);
  // A kept version whose answer cannot be read: the page again, and the same search asked again with its new script's version.
  clearHttpCache();
  const newer = 'js-min_00000000000000000000000000000000000000000000000000000000000000bb.js';
  calls = serve([setup(77), answer('<html>reload</html>', { status: 409, type: 'text/html' }), page(pageWith(newer)),
    answer(fixture('apollo-js-min-excerpt.js').replace('2026-01-16.01', '2027-04-01.01'), { type: 'text/javascript' }),
    answer(fixture('lawton-live-isbn-9780385547345.xml'))]);
  const rows = await librarySearch(lawton, '9780385547345');
  assert.deepEqual(rows.map(row => row.title), ['Lessons in chemistry: a novel']);
  assert.deepEqual([calls[1].options.body, calls[4].options.body], ['{"search_id":77,"catalog_version":"2026-01-16.01"}', '{"search_id":77,"catalog_version":"2027-04-01.01"}']);
  // Read in this check already, or the page names the same script: no second try.
  clearHttpCache();
  clearApolloVersions();
  calls = serve([page(), setup(), answer('<html></html>')]);
  await coded(librarySearch(lawton, 'Lessons in Chemistry'), 'CATALOG_UNRECOGNIZED');
  assert.equal(calls.length, 3);
  clearHttpCache();
  calls = serve([setup(), answer('<html></html>'), page()]);
  await coded(librarySearch(lawton, 'Lessons in Chemistry'), 'CATALOG_UNRECOGNIZED');
  assert.equal(calls.length, 3);
  // The catalog did not hold an older version against a search (live check, 24 November 2026: catalog_version 2025-01-01.01, 14 records).
  assert.equal(parseApolloResults(fixture('lawton-live-stale-version-remarkably-bright-creatures.xml'), site).length, 14);
});

test('walls, refusals, moves and server errors are "couldn\'t check", at any step; a move is never followed', async () => {
  const chain = () => [page(), setup(), answer(fixture('lawton-live-lessons-in-chemistry.xml'))];
  const cases = [
    [0, answer('denied', { status: 403, type: 'text/html' }), 'CATALOG_PROVIDER_BLOCKED'],
    [1, answer('slow down', { status: 429 }), 'CATALOG_PROVIDER_BLOCKED'],
    [0, page('<html><title>Just a moment...</title><script src="/cdn-cgi/challenge-platform/x"></script></html>'), 'CATALOG_PROVIDER_BLOCKED'],
    [2, answer('<html><script src="https://x/.within.website/x/cmd/anubis/static/js/main.mjs"></script></html>', { type: 'text/html' }), 'CATALOG_PROVIDER_BLOCKED'],
    [0, answer('', { status: 301, location: 'https://elsewhere.example/catalog/' }), 'CATALOG_UNAVAILABLE'],
    [1, answer('', { status: 302, location: '/catalog/' }), 'CATALOG_UNAVAILABLE'],
    [1, answer('oops', { status: 500 }), 'CATALOG_UNAVAILABLE'],
    [2, answer('oops', { status: 503 }), 'CATALOG_UNAVAILABLE'],
    [0, Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }), 'CATALOG_UNAVAILABLE'],
    [1, Object.assign(new Error('request deadline exceeded'), { name: 'AbortError' }), 'CATALOG_TIMEOUT'],
  ];
  for (const [step, failure, code] of cases) {
    clearHttpCache();
    clearApolloVersions();
    const answers = chain();
    answers[step] = failure;
    const calls = serve(answers);
    await coded(librarySearch(lawton, 'Lessons in Chemistry'), code);
    assert.equal(calls.length, step + 1, `${code} at ${step}`);
  }
  await coded(librarySearch(lawton, '!!! ()'), 'CATALOG_QUERY_UNSUPPORTED');
});

test('robots.txt is read for every request: Biblionix\'s template leaves the catalog open, and a rule against a path is never stepped round', async () => {
  // Every *.biblionix.com robots.txt read (research items 8 and 11, 23 November 2026; the live checks, 24 November 2026).
  const template = robotsRules('User-agent: *\nDisallow: /ill/\n\nUser-agent: Yandex\nDisallow: /\n');
  assert.equal(template.delay, 0);
  for (const url of ['https://lawton.biblionix.com/catalog/', setupUrl(apolloSite(lawton), 'x'), 'https://lawton.biblionix.com/catalog/ajax_backend/perform_search.xml.pl',
    `https://lawton.biblionix.com/catalog/optimized/${KNOWN}`]) assert.equal(robotsAllowed(template, url), true, url);
  assert.equal(robotsAllowed(template, 'https://lawton.biblionix.com/ill/request'), false);
  // A host whose file closes the search: nothing after the catalog page is sent.
  const closed = robotsRules('User-agent: *\nDisallow: /catalog/ajax_backend/\n');
  const robots = async url => ({ allowed: robotsAllowed(closed, url), delayMs: 0 });
  const calls = serve([page()]);
  await assert.rejects(withCatalogOperation({ robots }, () => librarySearch(lawton, 'Lessons in Chemistry')), error => error.code === 'CATALOG_PROVIDER_BLOCKED' && error.robots === true);
  assert.deepEqual(calls.map(call => new URL(call.url).pathname), ['/catalog/']);
});

test('the term is plain words; the entry gives the origin, and a branch where one is named', () => {
  assert.equal(searchTerm('Oh, the Places You\'ll Go!'), 'Oh the Places You\'ll Go');
  assert.equal(searchTerm('title: "Kinney" -wimpy Spider-Man a|b & c (x) kil\u00adl'), 'title Kinney wimpy Spider-Man a b c x kill');
  // The live checks' requests: the server read the words as sent (its answer echoes them).
  assert.equal(setupUrl(apolloSite(clearLake), 'Cien años de soledad'), 'https://cllibrary.biblionix.com/catalog/ajax_backend/search_setup.xml.pl?search=keyword%3ACien%20a%C3%B1os%20de%20soledad');
  assert.match(fixture('clearlake-live-cien-anos-de-soledad.xml'), /description="Keyword: Cien años de soledad"/);
  assert.match(fixture('lawton-live-oh-the-places-youll-go.xml'), /description="Keyword: Oh the Places You&#39;ll Go"/);
  assert.equal(recordUrl(apolloSite(lawton), '270748142'), 'https://lawton.biblionix.com/catalog/?search_biblio=270748142');
  assert.deepEqual(searchBody(5, '2026-01-16.01'), { search_id: 5, catalog_version: '2026-01-16.01' });
  assert.deepEqual(apolloSite({ ...lawton, apolloBranchFilter: '42464198' }), { origin: 'https://lawton.biblionix.com', branch: '42464198' });
  assert.deepEqual(searchBody(5, 'v', '42464198'), { search_id: 5, catalog_version: 'v', branches_filter: '42464198' });
  for (const bad of [{ baseUrl: 'http://lawton.biblionix.com/' }, { baseUrl: 'https://lawton.biblionix.com/catalog/' }, { baseUrl: undefined },
    { apolloBranchFilter: 42464198 }, { apolloBranchFilter: '4246&x=1' }]) {
    assert.throws(() => apolloSite({ ...lawton, ...bad }), error => error.code === 'CATALOG_CONFIGURATION_REQUIRED', JSON.stringify(bad));
  }
});

test('a branch limit is the catalog\'s own branch view: the branch goes in the search body (Lawton, research item 8)', async () => {
  const calls = serve([page(), setup(1162876082), answer(fixture('lawton-8-title-lessons-in-chemistry-branch-42464198.xml'))]);
  assert.deepEqual(await librarySearch({ ...lawton, apolloBranchFilter: '42464198' }, 'Lessons in Chemistry'), []);
  assert.equal(calls[2].options.body, '{"search_id":1162876082,"catalog_version":"2026-01-16.01","branches_filter":"42464198"}');
  // The same search without the branch: the print book and its two Libby editions.
  assert.equal(parseApolloResults(fixture('lawton-8-title-lessons-in-chemistry.xml'), apolloSite(lawton)).length, 3);
});

test('the book check: the provider\'s one search finds the book, the print book first; an ISBN finds its record; nothing is not found', async () => {
  const provider = getProvider(getLibraryById('apollo:lawton-ok'));
  assert.equal(provider.searchBy, undefined);
  serve([page(), setup(), answer(fixture('lawton-live-lessons-in-chemistry.xml'))]);
  const found = await searchLibraryBook(provider, { title: 'Lessons in Chemistry', authors: ['Bonnie Garmus'] });
  assert.equal(found.outcome, 'in_catalog');
  assert.deepEqual(found.matches.map(match => match.title), ['Lessons in chemistry: a novel', 'Lessons in Chemistry: A Novel', 'Lessons in Chemistry: A Novel']);
  assert.equal(found.matches[0].url, 'https://lawton.biblionix.com/catalog/?search_biblio=560534600');
  // A scanned ISBN with no title known: Apollo's keyword index holds ISBNs (both hosts, live checks of 24 November 2026).
  clearHttpCache();
  const calls = serve([setup(), answer(fixture('lawton-live-isbn-9780385547345.xml'))]);
  const byIsbn = await searchLibraryBook(provider, { title: '' }, { readerIsbn: '9780385547345' });
  assert.match(calls[0].url, /search=keyword%3A9780385547345$/);
  assert.equal(byIsbn.matchKind, 'exact_isbn');
  assert.equal(byIsbn.matches[0].title, 'Lessons in chemistry: a novel');
  // A long series: its siblings pass the title rule; ten rows on the card.
  clearHttpCache();
  serve([setup(), answer(fixture('lawton-live-diary-of-a-wimpy-kid.xml'))]);
  const wimpy = await searchLibraryBook(provider, { title: 'Diary of a Wimpy Kid', authors: ['Jeff Kinney'] });
  assert.equal(wimpy.outcome, 'in_catalog');
  assert.match(wimpy.matches[0].title, /^Diary of a wimpy kid/i);
  assert.equal(wimpy.matches.length, 10);
  // The soft-hyphenated titles of research item 8 are found too.
  clearHttpCache();
  serve([page(), setup(), answer(fixture('clearlake-8-to-kill-a-mockingbird.xml'))]);
  const mockingbird = await searchLibraryBook(getProvider(getLibraryById('apollo:clear-lake-ia')), { title: 'To Kill a Mockingbird', authors: ['Harper Lee'] });
  assert.equal(mockingbird.outcome, 'in_catalog');
  assert.deepEqual(mockingbird.matches.slice(0, 3).map(match => match.title), ['To kill a mockingbird', 'To kill a mockingbird', 'To kill a mockingbird']);
  // Nothing found is "not found".
  clearHttpCache();
  serve([setup(), answer(fixture('clearlake-live-no-hits.xml'))]);
  assert.deepEqual(await searchLibraryBook(getProvider(getLibraryById('apollo:clear-lake-ia')), { title: 'Qzxvbn Wrrtplk Mmnoqz' }), { outcome: 'no_match' });
});

test('storage: Apollo may keep an answer (its vendor\'s public pages were read); a second search is served from the rows cache', async () => {
  const apollo = getAllLibraries().filter(entry => entry.platform === 'apollo');
  assert.ok(apollo.length >= 6);
  for (const entry of apollo) assert.equal(storesAvailability(entry.id), true, entry.id);
  const library = getLibraryById('apollo:lawton-ok');
  const calls = serve([page(), setup(), answer(fixture('lawton-live-lessons-in-chemistry.xml'))]);
  await librarySearch(library, 'Lessons in Chemistry');
  await librarySearch(library, 'Lessons in Chemistry');
  assert.equal(calls.length, 3);
});

test('pacing and formats: one Apollo descriptor, a host per library, two requests a check; every label seen read as its kind', () => {
  const platform = platformFor(getLibraryById('apollo:lawton-ok'));
  assert.equal(platform.id, 'apollo');
  assert.equal(platform.results.strategy, 'search');
  assert.ok(platform.results.maxRequests >= 4);
  assert.ok(platform.perMinute > 0 && platform.perMinute <= 60);
  assert.equal(hostFor(getLibraryById('apollo:lawton-ok')), 'lawton.biblionix.com');
  assert.equal(hostFor(getLibraryById('apollo:clear-lake-ia')), 'cllibrary.biblionix.com');
  for (const entry of getAllLibraries().filter(item => item.platform === 'apollo')) {
    assert.equal(apolloSite(entry).origin, new URL(entry.baseUrl).origin, entry.id);
    assert.match(new URL(entry.baseUrl).hostname, /^[a-z0-9-]+\.biblionix\.com$/, entry.id);
  }
  const seen = { 'large print': 'book', 'sound recording': 'audiobook', videorecording: 'video', eBook: 'ebook', Audiobook: 'audiobook', Playaway: 'audiobook',
    'board book': 'book', 'graphic novel': 'book', Vox: 'book', 'music recording': 'music', kit: 'other', Magazine: 'other', 'electronic resource': 'ebook' };
  for (const [label, kind] of Object.entries(seen)) assert.equal(formatKind(label), kind, label);
  // An empty medium is a print book: no format, with the books.
  assert.deepEqual([undefined, 'large print', 'eBook', 'Audiobook', 'kit', 'videorecording', 'music recording'].map(format => formatTier({ format })), [0, 0, 1, 1, 2, LAST_TIER, LAST_TIER]);
});
