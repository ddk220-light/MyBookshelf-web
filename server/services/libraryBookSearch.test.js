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

// ---- Plan A2, step 1: keep what was proven ----------------------------------
test('the first proven match ends the search, even while the paired title search is still waiting', async () => {
  const { catalogOperation } = await import('./providers/http.js');
  let titleCancelled = false, isbnCalls = 0;
  const started = Date.now();
  const result = await searchLibraryBook({
    // The reader's own ISBN proves the edition at once (no copy marked available).
    checkAvailability: async () => { isbnCalls++; return { ...found, outcome: 'none_available' }; },
    // The title search would answer only after the deadline.
    searchCatalog: () => new Promise((resolve, reject) => {
      const signal = catalogOperation().signal;
      const timer = setTimeout(() => resolve([]), 5_000);
      signal.addEventListener('abort', () => { titleCancelled = true; clearTimeout(timer); reject(Object.assign(new Error('cancelled'), { code: 'CATALOG_ABORTED' })); }, { once: true });
    }),
  }, profile, { timeoutMs: 4_000 });
  assert.equal(result.outcome, 'none_available');
  assert.equal(result.matchKind, 'exact_isbn');
  assert.ok(Date.now() - started < 1_000, 'answered without waiting for the title search');
  assert.equal(titleCancelled, true, 'the waiting request is cancelled');
  assert.equal(isbnCalls, 1, 'no further ISBN is asked after a proven match');
});

test('a title/author-only match does not end the search early', async () => {
  const calls = [];
  const record = { recordId: '42', title: 'Wings of Fire: an autobiography', authors: ['Kalam, A P J Abdul'], observation: found };
  const result = await searchLibraryBook({ checkAvailability: async isbn => { calls.push(isbn); return isbn === '9788173715181' ? found : miss; },
    searchCatalog: async query => (query === book.title ? [record] : []) }, profile);
  // The possible match came first; the later proven ISBN still wins.
  assert.equal(result.matchKind, 'verified_work');
  assert.ok(calls.includes('9788173715181'));
});

test('the best proven match is shared through progress, and nothing more is asked after it', async () => {
  const progress = {};
  let isbnAsked = false;
  const result = await searchLibraryBook({
    findBookCandidates: async () => [{ recordId: '1', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'], isbn13: book.isbn13 }],
    resolveCatalogRecord: async id => ({ recordId: id, title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'], isbn13: book.isbn13,
      catalogUrl: 'https://catalog.example/record/1', observation: { outcome: 'in_catalog', recognizedExact: true } }),
    checkAvailability: async () => { isbnAsked = true; return miss; },
  }, profile, { progress });
  assert.equal(result.outcome, 'in_catalog');
  assert.equal(progress.best.matchKind, 'exact_isbn');
  assert.equal(progress.best.catalogUrl, 'https://catalog.example/record/1');
  assert.equal(isbnAsked, false, 'no ISBN request after the proven record');
});

import { absenceRisk, relatedRow, transliterationRisk } from './libraryBookSearch.js';

test('absence is provable only with ISBNs, an answered title search, no related rows and a Latin-script title', async () => {
  const english = { book: { isbn13: '9788173711466', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'] }, isbns: ['9788173711466'],
    titles: ['Wings of Fire'], authors: ['A. P. J. Abdul Kalam'], language: 'eng', complete: true };
  const summary = { partial: false, editionsComplete: true, titleSearches: 1, relatedTitles: 0 };
  assert.equal(absenceRisk(summary, english), null);
  assert.equal(absenceRisk({ ...summary, partial: true }, english), 'partial');
  assert.equal(absenceRisk(summary, { ...english, isbns: [] }), 'no_isbns');
  assert.equal(absenceRisk({ ...summary, titleSearches: 0 }, english), 'no_title_search');
  assert.equal(absenceRisk({ ...summary, relatedTitles: 1 }, english), 'related_titles');
  // Godaan (Hindi, romanised), a Devanagari title, and a work whose language is not known.
  assert.equal(transliterationRisk({ ...english, language: 'hin', titles: ['Godaan'] }), true);
  assert.equal(transliterationRisk({ ...english, titles: ['Wings of Fire', 'अग्नि की उड़ान'] }), true);
  assert.equal(transliterationRisk({ ...english, language: '' }), true);
  assert.equal(transliterationRisk({ ...english, language: 'fre', titles: ['Les Misérables'] }), false);
  // Rows: a volume of a set is related; a matching row is not "related".
  const ponniyin = { ...english, book: { title: 'Ponniyin Selvan' }, titles: ['Ponniyin Selvan'], authors: ['Kalki'], isbns: ['9788184931723'] };
  assert.equal(relatedRow({ title: 'Ponniyin Selvan Part 1', authors: ['Kalki Krishnamurthy'] }, ponniyin), true);
  assert.equal(relatedRow({ title: 'Ponniyin Selvan, vol. 2' }, ponniyin), true);
  // A same-title row under another name is related: catalogs put publishers in the author field (LIBMAN 520, "Rupa").
  assert.equal(relatedRow({ title: 'Wings of Fire', authors: ['Tui T. Sutherland'] }, english), true);
  assert.equal(relatedRow({ title: 'APJAbdul Kalam Wing Of Fire', authors: ['Rupa'] }, english), true);
  assert.equal(relatedRow({ title: 'Wings of Fire', authors: ['Kalam'], isbn: '9788173711466' }, english), false);
  assert.equal(relatedRow({ title: 'Firewings' }, english), false);

  // End to end: a title search answered with nothing, every ISBN not listed.
  const provider = { checkAvailability: async () => ({ outcome: 'not_found', matchKind: 'none', recognizedExact: true }), searchCatalog: async () => [] };
  const done = await searchLibraryBook(provider, english, { timeoutMs: 1_000 });
  assert.equal(done.outcome, 'no_match');
  assert.equal(done.searchSummary.absenceProvable, true);
  const godaan = await searchLibraryBook(provider, { ...english, book: { title: 'Godaan', authors: ['Premchand'] }, isbns: [], titles: ['Godaan'], authors: ['Premchand'], language: 'hin' }, { timeoutMs: 1_000 });
  assert.equal(godaan.outcome, 'no_match');
  assert.deepEqual([godaan.searchSummary.absenceProvable, godaan.searchSummary.absenceRisk], [false, 'no_isbns']);
});

// --- Integration, 19 November 2026 -------------------------------------------

const manyEditions = Array.from({ length: 11 }, (_, index) => `9788173${String(711 + index).padStart(4, '0')}0`)
  .map(value => value.slice(0, 12)).map(twelve => {
    const sum = [...twelve].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return twelve + ((10 - sum % 10) % 10);
  });

test('batch ISBN catalogs: editions are asked eight at a time, reader ISBN first, and every group counts as searched', async () => {
  const work = { ...profile, book: { ...book, isbn13: manyEditions[3] }, isbns: manyEditions };
  const groups = [];
  const provider = { checkAvailability: async () => { throw new Error('single ISBN lookups are not used'); },
    checkIsbns: async isbns => { groups.push(isbns); return { ...miss, isbns }; }, searchCatalog: async () => [] };
  const result = await searchLibraryBook(provider, work, { timeoutMs: 1_000 });
  assert.deepEqual(groups.map(group => group.length), [8, 3]);
  assert.equal(groups[0][0], manyEditions[3]);
  assert.deepEqual(new Set(groups.flat()), new Set(manyEditions));
  // 11 editions in 2 requests plus the title searches: the absence rule decides.
  assert.equal(result.outcome, 'no_match');
  assert.equal(result.searchSummary.partial, false);
  assert.equal(result.searchSummary.absenceProvable, true);
});

test('batch ISBN catalogs: a record proving another edition is verified_work; editions never asked make the search partial', async () => {
  const work = { ...profile, isbns: manyEditions, book: { ...book, isbn13: manyEditions[0] } };
  const hit = await searchLibraryBook({ checkIsbns: async isbns => (isbns.includes(manyEditions[9])
    ? { ...found, isbn13: manyEditions[9], catalogTitle: 'Wings of fire' } : { ...miss, isbns }), searchCatalog: async () => [] }, work, { timeoutMs: 1_000 });
  assert.deepEqual([hit.outcome, hit.matchKind, hit.matchedBook.isbn13], ['available', 'verified_work', manyEditions[9]]);
  const exact = await searchLibraryBook({ checkIsbns: async () => ({ ...found, isbn13: manyEditions[0] }), searchCatalog: async () => [] }, work, { timeoutMs: 1_000 });
  assert.equal(exact.matchKind, 'exact_isbn');
  // A not_found that does not list what it searched proves nothing about those editions.
  const vague = await searchLibraryBook({ checkIsbns: async isbns => ({ ...miss, isbns: isbns.slice(0, 1) }), searchCatalog: async () => [] }, work, { timeoutMs: 1_000 });
  assert.equal(vague.outcome, 'no_match');
  assert.equal(vague.searchSummary.partial, true);
  assert.equal(vague.searchSummary.absenceProvable, false);
  // Without an answered title search a batch "not found" stays unconfirmed (the absence rule).
  const isbnOnly = await searchLibraryBook({ checkIsbns: async isbns => ({ ...miss, isbns }) }, profile, { timeoutMs: 1_000 });
  assert.deepEqual([isbnOnly.outcome, isbnOnly.searchSummary.absenceRisk], ['no_match', 'no_title_search']);
  // A batch search the catalog could not answer is a failure, not absence.
  const failed = await searchLibraryBook({ checkIsbns: async () => { throw Object.assign(new Error('x'), { code: 'CATALOG_UNAVAILABLE' }); }, searchCatalog: async () => [] }, profile, { timeoutMs: 1_000 });
  assert.deepEqual([failed.outcome, failed.errorCode], ['unknown', 'CATALOG_UNAVAILABLE']);
});

test('a title-only catalog (isbnLookup: false) is not partial for the ISBNs it is never asked', async () => {
  let asked = 0;
  const result = await searchLibraryBook({ isbnLookup: false, checkAvailability: async () => { asked++; return miss; }, searchCatalog: async () => [] },
    { ...profile, isbns: manyEditions }, { timeoutMs: 1_000 });
  assert.equal(asked, 0);
  assert.equal(result.outcome, 'no_match');
  assert.equal(result.searchSummary.partial, false);
  assert.equal(result.searchSummary.absenceProvable, true);
});

test('rowTitlesReliable: rows whose own title rules them out are not opened', async () => {
  const opened = [];
  const rows = [{ recordId: '1', title: 'Fire and ice' }, { recordId: '2', title: 'Wings of fire' }];
  const provider = { rowTitlesReliable: true, checkIsbns: async isbns => ({ ...miss, isbns }), searchCatalog: async () => rows,
    resolveCatalogRecord: async id => { opened.push(id); return { title: 'Wings of fire', authors: book.authors, isbn: book.isbn13, observation: found }; } };
  const result = await searchLibraryBook(provider, profile, { timeoutMs: 1_000 });
  assert.deepEqual(opened, ['2']);
  assert.equal(result.matchKind, 'exact_isbn');
});

test('a work ISBN with an agreeing title is a match even when the catalog lists a co-author (SRS Jammu, "Tiwari, Arun")', async () => {
  const row = { title: 'Wings of fire : an autobiography', authors: ['Tiwari, Arun'], isbn: '9788173711466' };
  assert.deepEqual(matchCatalogRecord(row, profile), { matchKind: 'exact_isbn', isbn13: '9788173711466' });
  // Without the ISBN the other author still rules the row out; a title that disagrees is never rescued by an ISBN.
  assert.equal(matchCatalogRecord({ ...row, isbn: undefined }, profile), null);
  assert.equal(matchCatalogRecord({ ...row, title: 'Ignited minds' }, profile), null);
  // Title first: the row is read first and proves the edition.
  const result = await searchLibraryBook({ isbnLookup: false, findBookCandidates: async () => [{ ...row, recordId: '31499', observation: { outcome: 'in_catalog', matchKind: 'verified_work', recognizedExact: true } }] }, profile, { timeoutMs: 1_000 });
  assert.deepEqual([result.outcome, result.matchKind], ['in_catalog', 'exact_isbn']);
});

test('titles compare without a leading English article (SRMS: "DISCOVERY OF INDIA")', async () => {
  const nehru = { book: { title: 'The Discovery of India', authors: ['Jawaharlal Nehru'], isbn13: '9780143031031' }, isbns: ['9780143031031'],
    titles: ['The Discovery of India'], authors: ['Jawaharlal Nehru'], language: 'eng', complete: true };
  assert.equal(matchCatalogRecord({ title: 'DISCOVERY OF INDIA', authors: ['Nehru, Jawaharlal'] }, nehru).matchKind, 'possible_match');
  assert.equal(matchCatalogRecord({ title: 'Discovery of India', authors: ['Nehru, Jawaharlal'], isbn: '9780143031031' }, nehru).matchKind, 'exact_isbn');
  assert.equal(relatedRow({ title: 'DISCOVERY OF INDIA VOL 2', authors: ['Nehru, J.'] }, nehru), true);
  // An unarticled title is not stripped of its first word.
  assert.equal(matchCatalogRecord({ title: 'Theory of India', authors: ['Jawaharlal Nehru'] }, nehru), null);
  const result = await searchLibraryBook({ isbnLookup: false, searchCatalog: async () => [{ recordId: '7', title: 'DISCOVERY OF INDIA', authors: ['NEHRU, JAWAHARLAL'] }],
    resolveCatalogRecord: async () => ({ title: 'DISCOVERY OF INDIA', authors: ['NEHRU, JAWAHARLAL'], observation: found }) }, nehru, { timeoutMs: 1_000 });
  assert.equal(result.matchKind, 'possible_match');
});

test('a title-and-author match is kept in progress for a deadline answer, but never as a proven match', async () => {
  const progress = {};
  const record = { recordId: '42', title: book.title, authors: book.authors, observation: found };
  await searchLibraryBook({ isbnLookup: false, searchCatalog: async () => [record], resolveCatalogRecord: async () => record }, profile, { timeoutMs: 1_000, progress });
  assert.equal(progress.best, undefined);
  assert.equal(progress.possible.matchKind, 'possible_match');
});

test('legacy title queries are not repeated when titles differ only in case', async () => {
  const queries = [];
  await searchLibraryBook({ isbnLookup: false, searchCatalog: async query => { queries.push(query); return []; } },
    { ...profile, titles: ['Wings of Fire', 'Wings of fire'] }, { timeoutMs: 1_000 });
  // The third is the singular-title probe that precedes any absence claim.
  assert.deepEqual(queries, ['Wings of Fire A. P. J. Abdul Kalam', 'Wings of Fire', 'Wing of Fire']);
});

test('before "not found", a singular-title search runs; a row under that variant title leaves the answer unconfirmed (HCDGC, "Concept of Physics")', async () => {
  const { singularTitleVariant } = await import('./libraryBookSearch.js');
  assert.equal(singularTitleVariant('Concepts of physics'), 'Concept of physics');
  assert.equal(singularTitleVariant('The Discovery of India'), null);
  assert.equal(singularTitleVariant('Physics'), null);
  const verma = { book: { title: 'Concepts of physics', authors: ['H. C. Verma'], isbn13: '9788177091878' }, isbns: ['9788177091878', '9788177092325'],
    titles: ['Concepts of physics'], authors: ['H. C. Verma'], language: 'eng', complete: true };
  // A title substring search: the library's record is titled in the singular.
  const shelf = [{ recordId: 'r1', title: 'Concept of Physics', authors: ['Verma, H.C.,'] }];
  const substring = query => shelf.filter(row => row.title.toLowerCase().includes(query.toLowerCase()));
  const queries = [];
  const result = await searchLibraryBook({ isbnLookup: false, searchCatalog: async query => { queries.push(query); return substring(query); },
    resolveCatalogRecord: async () => ({ ...shelf[0], observation: found }) }, verma, { timeoutMs: 1_000 });
  assert.ok(queries.includes('Concept of physics'));
  assert.notEqual(result.searchSummary?.absenceProvable, true);
  // Title first, same rule.
  const titleFirst = await searchLibraryBook({ isbnLookup: false, findBookCandidates: async ({ title }) => substring(title) }, verma, { timeoutMs: 1_000 });
  assert.equal(titleFirst.outcome, 'no_match');
  assert.deepEqual([titleFirst.searchSummary.absenceProvable, titleFirst.searchSummary.absenceRisk], [false, 'related_titles']);
  // The probe failing is a failure, not absence.
  let calls = 0;
  const failing = await searchLibraryBook({ isbnLookup: false, searchCatalog: async () => { if (++calls > 2) throw Object.assign(new Error('x'), { code: 'CATALOG_UNAVAILABLE' }); return []; } }, verma, { timeoutMs: 1_000 });
  assert.equal(failing.outcome, 'unknown');
});
