import test from 'node:test';
import assert from 'node:assert/strict';
import { matchCatalogRecord, searchLibraryBook } from './libraryBookSearch.js';

const book = { title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'], isbn13: '9788173711466' };
const profile = { book, isbns: [book.isbn13, '9788173715181'], titles: [book.title], authors: book.authors, language: 'eng', complete: true };
const miss = { outcome: 'not_found', matchKind: 'none', recognizedExact: true };
const found = { outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true, catalogUrl: 'https://catalog.example/record/42' };

test('missing scanned ISBN recovers a known edition while title search starts early', async () => {
  const calls = [];
  const result = await searchLibraryBook({ checkAvailability: async isbn => {
    calls.push(isbn); return isbn === '9788173715181' ? found : miss;
  }, searchCatalog: async query => { calls.push(query); return []; } }, profile);
  assert.equal(result.outcome, 'available');
  assert.equal(result.matchKind, 'verified_work');
  assert.equal(result.matchedBook.isbn13, '9788173715181');
  assert.equal(calls[1], 'Wings of Fire A. P. J. Abdul Kalam');
  assert.ok(calls.includes('8173711461'));
});

test('ISBN-less records survive author order and initials, without claiming confirmed availability', async () => {
  const record = { recordId: '42', title: 'Wings of Fire: an autobiography', authors: ['Kalam, A P J Abdul'], observation: found };
  const result = await searchLibraryBook({ checkAvailability: async () => miss,
    searchCatalog: async query => query === book.title ? [record] : [] }, profile);
  assert.equal(result.matchKind, 'possible_match');
  assert.equal(result.outcome, 'in_catalog');
  assert.equal(result.lookupKind, 'title_author');
});

test('rejects same-name books, other volumes, adaptations, languages, and formats', () => {
  for (const record of [
    { title: book.title, authors: ['Tui T. Sutherland'] },
    { title: 'Wings of Fire 2', authors: book.authors },
    { title: 'Wings of Fire: The Dragonet Prophecy', authors: book.authors },
    { title: 'Wings of Fire: study guide', authors: book.authors },
    { title: 'Wings of Fire: 2nd edition', authors: book.authors },
    { title: book.title, authors: book.authors, language: 'hin' },
    { title: book.title, authors: book.authors, format: 'Audiobook' },
  ]) assert.equal(matchCatalogRecord(record, profile), null);
  assert.equal(matchCatalogRecord({ title: book.title, authors: book.authors, isbn: '8173715181' }, profile).matchKind, 'verified_work');
});

test('examines later hits, reopens durable records once, and retains success across failures', async () => {
  let reopen = 0;
  const result = await searchLibraryBook({ checkAvailability: async () => { throw new Error('timeout'); },
    searchCatalog: async () => [{ recordId: 'wrong', title: 'Other' }, { recordId: '42', title: book.title }],
    resolveCatalogRecord: async id => { reopen++; return id === '42'
      ? { title: book.title, isbn: '8173715181', authors: book.authors, observation: found } : { title: 'Other', authors: ['Other'], observation: found }; },
  }, profile);
  assert.equal(result.outcome, 'available');
  assert.equal(result.matchKind, 'verified_work');
  assert.equal(result.searchSummary.partial, true);
  assert.equal(reopen, 2);
});

test('completed bounded miss differs from failure and deadline; requests remain bounded', async (t) => {
  const result = await searchLibraryBook({ checkAvailability: async () => miss, searchCatalog: async () => [] }, profile);
  assert.equal(result.outcome, 'no_match');
  assert.ok(result.searchSummary.isbnQueries <= 6);
  assert.ok(result.searchSummary.titleQueries <= 3);
  const failure = await searchLibraryBook({ checkAvailability: async () => { throw new Error('blocked'); } }, profile);
  assert.equal(failure.outcome, 'unknown');
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const pending = searchLibraryBook({ checkAvailability: () => new Promise(() => {}) }, profile, { timeoutMs: 15 });
  t.mock.timers.tick(15);
  const deadline = await pending;
  assert.equal(deadline.outcome, 'unknown');
  assert.equal(deadline.searchSummary.isbnQueries, 1);
});

test('pilot catalog envelopes participate in edition search and preserve reference-only evidence', async () => {
  const result = await searchLibraryBook({ checkAvailability: async () => miss,
    searchCatalog: async () => ({ records: [{ recordId: '42', title: book.title }], hasMore: true }),
    resolveCatalogRecord: async () => ({ title: book.title, authors: book.authors, isbn13: profile.isbns[1],
      observation: { outcome: 'unknown', matchKind: 'catalog_record', recognizedRecord: true,
        loanRestriction: 'not_for_loan', notForLoanCopies: 1, totalCopies: 1 } }),
  }, profile);
  assert.equal(result.matchKind, 'verified_work');
  assert.equal(result.loanRestriction, 'not_for_loan');
  assert.equal(result.availableCopies, undefined);
  assert.equal(result.searchSummary.partial, true);
  assert.equal(result.searchSummary.recordsChecked, 1);
});

test('title matching keeps Hindi and Tamil vowel signs and still folds Latin accents', () => {
  const indic = (title, author) => ({ book: { title, authors: [author], isbn13: '9788126704835' }, isbns: [], titles: [title], authors: [author], complete: true });
  const hindi = indic('राम', 'तुलसीदास');
  assert.equal(matchCatalogRecord({ title: 'राम', authors: ['तुलसीदास'] }, hindi).matchKind, 'possible_match');
  // Different vowel signs are different words, not spelling variants.
  assert.equal(matchCatalogRecord({ title: 'रोम', authors: ['तुलसीदास'] }, hindi), null);
  assert.equal(matchCatalogRecord({ title: 'गदन', authors: ['प्रेमचंद'] }, indic('गोदान', 'प्रेमचंद')), null);
  assert.equal(matchCatalogRecord({ title: 'गोदान', authors: ['प्रेमचंद'] }, indic('गोदान', 'प्रेमचंद')).matchKind, 'possible_match');
  const tamil = indic('கடல்', 'கல்கி');
  assert.equal(matchCatalogRecord({ title: 'கடலை', authors: ['கல்கி'] }, tamil), null);
  assert.equal(matchCatalogRecord({ title: 'கடல்', authors: ['கல்கி'] }, tamil).matchKind, 'possible_match');
  // A zero-width joiner used only for display does not make a different title.
  assert.equal(matchCatalogRecord({ title: 'हिन्\u200dदी कहानी', authors: ['प्रेमचंद'] }, indic('हिन्दी कहानी', 'प्रेमचंद')).matchKind, 'possible_match');
  const french = { book: { title: 'Les Misérables', authors: ['Victor Hugo'], isbn13: '9780140444308' }, isbns: [], titles: ['Les Misérables'], authors: ['Victor Hugo'], complete: true };
  assert.equal(matchCatalogRecord({ title: 'LES MISERABLES', authors: ['Hugo, Victor'] }, french).matchKind, 'possible_match');
  assert.equal(matchCatalogRecord({ title: 'Les Misérables', authors: ['Hugo, Victor'] }, french).matchKind, 'possible_match');
});

// ---- Title-first checks on the South Indian pilot catalogs -------------------
import fs from 'node:fs';
import { getAllLibraries } from './directory.js';
import { getProvider } from './providers/index.js';
import { clearHttpCache } from './providers/http.js';
import { configureVisakhapatnamPacing } from './providers/visakhapatnam.js';
import { checkBudgetMs, TITLE_FIRST_MAX_REQUESTS } from './libraryBookSearch.js';

const kohaPage = name => fs.readFileSync(new URL(`../test/fixtures/koha/${name}.html`, import.meta.url), 'utf8');
const vplPage = name => fs.readFileSync(new URL(`../test/fixtures/vpl/${name}.html`, import.meta.url), 'utf8');
const entry = id => getAllLibraries().find(library => library.id === id);
const kalam = { book: { title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'], isbn13: '9788173711466' },
  isbns: ['9788173711466', '9788173715181', '9788173715488'], titles: ['Wings of Fire'], authors: ['A. P. J. Abdul Kalam'], language: 'eng', complete: true };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// Replays saved catalog pages. `latencyMs` stands in for the catalog's own
// response time, scaled down 100× (90 ms here = 9 s on Anna Centenary).
function replay(t, pages, { latencyMs = 0 } = {}) {
  const requests = [];
  const original = global.fetch;
  global.fetch = async url => {
    requests.push(url);
    await sleep(latencyMs);
    const html = pages(new URL(url));
    return { url, status: html ? 200 : 500, ok: Boolean(html), headers: new Headers(), text: async () => html || '' };
  };
  t.after(() => { global.fetch = original; clearHttpCache(); });
  clearHttpCache();
  return requests;
}

test('check budgets follow the directory, bounded at 45 s', () => {
  assert.equal(checkBudgetMs(entry('koha:anna-centenary-library')), 45_000);
  assert.equal(checkBudgetMs(entry('koha:kalaignar-centenary-library')), 45_000);
  assert.equal(checkBudgetMs(entry('koha:ernakulam-public-library')), 45_000);
  assert.equal(checkBudgetMs(entry('vpl:visakhapatnam-public-library')), 20_000);
  assert.equal(checkBudgetMs({ publicCatalogTimeoutMs: 60_000 }), 45_000);
  assert.equal(checkBudgetMs({}), 20_000);
});

test('title-first: one search, then only rows the search does not rule out, best evidence first', async () => {
  const calls = [];
  const rows = [
    { recordId: 'dragons', title: 'Wings of Fire', authors: ['Sutherland, Tui T'] },
    { recordId: 'other-isbn', title: 'Wings of fire: an autobiography', authors: ['Abdul Kalam, A. P. J'], isbn13: '9788181900050' },
    { recordId: 'no-isbn', title: 'Wings of Fire', authors: ['Abdul Kalam, APJ'] },
    { recordId: 'known', title: 'Wings Of Fire: An Autobiography', authors: ['Kalam, A P J Abdul'], isbn13: '9788173711466' },
    { recordId: 'study', title: 'Wings of Fire: study guide', authors: ['Kalam'] },
  ];
  const result = await searchLibraryBook({
    findBookCandidates: async search => { calls.push(['search', search]); return { records: rows, hasMore: false }; },
    resolveCatalogRecord: async id => { calls.push(['read', id]); const row = rows.find(r => r.recordId === id);
      return { ...row, isbn: row.isbn13, observation: { outcome: 'available', totalCopies: 3, availableCopies: 3 } }; },
    checkAvailability: async isbn => { calls.push(['isbn', isbn]); return miss; },
  }, kalam);
  assert.deepEqual(calls, [['search', { title: 'Wings of Fire', author: 'A. P. J. Abdul Kalam' }], ['read', 'known']]);
  assert.equal(result.outcome, 'available');
  assert.equal(result.matchKind, 'exact_isbn');
  assert.equal(result.searchSummary.recordsChecked, 1);
});

test('title-first: similar editions are read once, ISBNs are tried only when the search finds nothing', async () => {
  const reads = [], isbns = [];
  const similar = await searchLibraryBook({
    findBookCandidates: async () => [1, 2, 3].map(n => ({ recordId: String(n), title: 'Wings of fire', authors: ['Abdul Kalam, A. P. J'], isbn13: '9788181900050' })),
    resolveCatalogRecord: async id => { reads.push(id); return { title: 'Wings of fire', authors: ['Abdul Kalam, A. P. J'], isbn: '9788181900050', observation: { outcome: 'available' } }; },
    checkAvailability: async isbn => { isbns.push(isbn); return miss; },
  }, kalam);
  assert.deepEqual(reads, ['1']);
  assert.deepEqual(isbns, []);
  assert.equal(similar.matchKind, 'possible_match');
  assert.equal(similar.outcome, 'in_catalog');
  const empty = await searchLibraryBook({ findBookCandidates: async () => [], checkAvailability: async isbn => { isbns.push(isbn); return isbn === '9788173715181' ? found : miss; } }, kalam);
  assert.deepEqual(isbns, ['9788173711466', '9788173715181']);
  assert.equal(empty.matchKind, 'verified_work');
  // A search that fails and leaves no evidence is unknown, never "not found".
  const failed = await searchLibraryBook({ findBookCandidates: async () => { throw Object.assign(new Error('x'), { code: 'CATALOG_TIMEOUT' }); }, isbnLookup: false, checkAvailability: async () => miss }, kalam);
  assert.equal(failed.outcome, 'unknown');
  assert.equal(failed.errorCode, 'CATALOG_TIMEOUT');
});

test('hard cap: a check never sends more upstream requests than its budget, and an exhausted budget is unknown', async (t) => {
  const library = entry('koha:anna-centenary-library');
  // Every record reads as another edition without the copy information, so the
  // check keeps looking until the cap stops it.
  const requests = replay(t, url => url.pathname.endsWith('opac-search.pl')
    ? (url.searchParams.get('idx') === 'kw' && url.searchParams.get('q') === 'Wings of Fire Kalam' ? kohaPage('chennai-wings-search') : null)
    : null);
  const result = await searchLibraryBook(getProvider(library), kalam, { maxRequests: 3 });
  assert.ok(requests.length <= 3, `${requests.length} requests`);
  assert.equal(result.searchSummary.requests, requests.length);
  assert.equal(result.outcome, 'unknown');
  assert.notEqual(result.outcome, 'no_match');
  assert.equal(TITLE_FIRST_MAX_REQUESTS, 6);
});

test('replay, Anna Centenary: 2 requests at 9 s each finish inside the 45 s budget (old flow timed out at 20 s)', async (t) => {
  const library = entry('koha:anna-centenary-library');
  // The saved Anna record 309106 (Universities Press, 1999) carries ISBN
  // 9788181900050; this profile lists that edition.
  const universities = { ...kalam, book: { ...kalam.book, isbn13: '9788181900050' }, isbns: ['9788181900050'] };
  const requests = replay(t, url => {
    if (url.pathname.endsWith('opac-search.pl')) return url.searchParams.get('q') === 'Wings of Fire Kalam' ? kohaPage('chennai-wings-search') : null;
    return url.searchParams.get('biblionumber') === '309106' ? kohaPage('anna-wings-309106') : null;
  }, { latencyMs: 90 });
  const started = Date.now();
  const result = await searchLibraryBook(getProvider(library), universities, { timeoutMs: checkBudgetMs(library) / 100 });
  assert.equal(requests.length, 2);
  assert.ok(Date.now() - started < checkBudgetMs(library) / 100);
  assert.equal(result.matchKind, 'exact_isbn');
  assert.equal(result.outcome, 'available');
  assert.equal(result.availableCopies, 1);
  assert.equal(result.searchSummary.requests, 2);
});

test('replay, Ernakulam: a title-index search and at most three record reads (was 8–11 requests)', async (t) => {
  const library = entry('koha:ernakulam-public-library');
  const record = kohaPage('ernakulam-wings-100942');
  const requests = replay(t, url => {
    if (url.pathname.endsWith('opac-search.pl')) {
      assert.equal(url.searchParams.get('idx'), 'ti');
      assert.equal(url.searchParams.get('q'), 'Wings of Fire');
      return kohaPage('ernakulam-wings-search');
    }
    return record.replaceAll('100942', url.searchParams.get('biblionumber'));
  });
  const result = await searchLibraryBook(getProvider(library), kalam, { timeoutMs: checkBudgetMs(library) });
  assert.ok(requests.length <= 4, `${requests.length} requests`);
  // The saved Ernakulam record lists no ISBN, so this is a similar edition.
  assert.equal(result.matchKind, 'possible_match');
  assert.equal(result.outcome, 'in_catalog');
  // Tui Sutherland's "Wings of Fire" rows are ruled out from the search page alone.
  assert.ok(requests.every(url => !/biblionumber=(?:199310|147571|189517)/.test(url)));
});

test('replay, Visakhapatnam: one paced request answers the check from the search page', async (t) => {
  configureVisakhapatnamPacing({ crawlDelayMs: 20_000 });
  t.after(() => configureVisakhapatnamPacing({ crawlDelayMs: 0 }));
  const library = entry('vpl:visakhapatnam-public-library');
  const page = vplPage('wings-of-fire').replace('value="wings of fire"', 'value="Wings of Fire"');
  const requests = replay(t, url => url.searchParams.get('title') === 'Wings of Fire' ? page : null);
  const started = Date.now();
  const result = await searchLibraryBook(getProvider(library), kalam, { timeoutMs: checkBudgetMs(library) });
  assert.equal(requests.length, 1);
  assert.ok(Date.now() - started < 1000);
  assert.equal(result.matchKind, 'possible_match');
  assert.equal(result.outcome, 'in_catalog');
  assert.equal(result.searchSummary.isbnQueries, 0);
});

// ---- Independent check: stopping early never reads as "not held" -------------
test('title-first: candidate rows left unread by the record limit, request cap or deadline make the check unknown, not no_match', async () => {
  const { catalogOperation } = await import('./providers/http.js');
  const rows = [1, 2, 3, 4].map(n => ({ recordId: String(n), title: 'Wings of Fire', authors: ['Abdul Kalam, A. P. J'] }));
  // Each record turns out to be in another language, so none matches; the
  // fourth row is never read.
  const otherLanguage = id => ({ title: 'Wings of Fire', authors: ['Abdul Kalam, A. P. J'], language: 'hin', observation: { outcome: 'available' }, recordId: id });
  const limited = await searchLibraryBook({ findBookCandidates: async () => rows, resolveCatalogRecord: async id => otherLanguage(id), isbnLookup: false, checkAvailability: async () => miss }, kalam);
  assert.equal(limited.searchSummary.recordsChecked, 3);
  assert.equal(limited.outcome, 'unknown');
  // The request cap stops reads before the second row.
  const capped = await searchLibraryBook({
    findBookCandidates: async () => { catalogOperation().requests += 1; return rows; },
    resolveCatalogRecord: async id => { catalogOperation().requests += 1; return otherLanguage(id); },
    isbnLookup: false, checkAvailability: async () => miss }, kalam, { maxRequests: 2 });
  assert.equal(capped.searchSummary.recordsChecked, 1);
  assert.equal(capped.outcome, 'unknown');
  // The deadline passes between two record reads.
  const late = await searchLibraryBook({ findBookCandidates: async () => rows,
    resolveCatalogRecord: async id => { await sleep(30); return otherLanguage(id); }, isbnLookup: false, checkAvailability: async () => miss }, kalam, { timeoutMs: 40 });
  assert.equal(late.outcome, 'unknown');
  // A record read that answers nothing is a failure, not a miss.
  const empty = await searchLibraryBook({ findBookCandidates: async () => rows.slice(0, 1), resolveCatalogRecord: async () => null, isbnLookup: false, checkAvailability: async () => miss }, kalam);
  assert.equal(empty.outcome, 'unknown');
  // Reading every candidate and finding none is still a completed miss.
  const done = await searchLibraryBook({ findBookCandidates: async () => rows.slice(0, 2), resolveCatalogRecord: async id => otherLanguage(id), isbnLookup: false, checkAvailability: async () => miss }, kalam);
  assert.equal(done.outcome, 'no_match');
});
