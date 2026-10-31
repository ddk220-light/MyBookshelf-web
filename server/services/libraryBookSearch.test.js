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
