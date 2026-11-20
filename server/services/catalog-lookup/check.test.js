import test from 'node:test';
import assert from 'node:assert/strict';
import { runBookCheck } from './check.js';
import { catalogOperation } from '../providers/http.js';

// Plan A2, step 1: a proven match found before the deadline is the answer,
// never "couldn't check". Fake providers only; no catalog is contacted.
const book = { title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'], isbn13: '9788173711466' };
const profile = { book, isbns: [book.isbn13, '9788173715181'], titles: [book.title], authors: book.authors, language: 'eng', complete: true };
const library = { id: 'koha:test', catalogUrl: 'https://catalog.example/',
  capabilities: { publicAvailability: true, catalogLink: true, copyCounts: false, callNumber: false, locationAvailability: false } };
const entry = { id: 'koha:test', platform: 'koha', catalogUrl: 'https://catalog.example/' };
const proven = { outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true, catalogUrl: 'https://catalog.example/record/42' };
const books = { searchProfile: async () => profile };
const hangs = () => new Promise((resolve, reject) => {
  const signal = catalogOperation()?.signal;
  signal?.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { code: 'CATALOG_ABORTED' })), { once: true });
});
const check = (provider, budget) => runBookCheck({ entry, library, provider, book, bookKey: `v1:isbn:${book.isbn13}`, lookupKind: 'verified_work',
  editionScope: 'work', books, attemptedAt: new Date().toISOString(), budget: { maxRequests: 12, ...budget } });

test('a match proven before the deadline is returned, though the paired title search never answers', async () => {
  const started = Date.now();
  const result = await check({ checkAvailability: async () => proven, searchCatalog: hangs }, { deadlineAt: Date.now() + 300 });
  assert.equal(result.error, undefined);
  assert.equal(result.response.outcome, 'available');
  assert.equal(result.response.matchKind, 'exact_isbn');
  assert.equal(result.response.catalogUrl, 'https://catalog.example/record/42');
  assert.ok(Date.now() - started < 250, 'the answer does not wait for the deadline');
});

test('at the deadline the best proven match found so far is the answer, not a timeout', async () => {
  // The search reports its proven match through `progress` but has not
  // returned when the deadline arrives.
  const progress = { best: { ...proven, matchedBook: { title: book.title, isbn13: book.isbn13 }, searchSummary: { partial: true } } };
  const result = await check({ checkAvailability: hangs, searchCatalog: hangs }, { deadlineAt: Date.now() + 50, progress });
  assert.equal(result.error, undefined);
  assert.equal(result.response.outcome, 'available');
  assert.equal(result.response.matchedBook.isbn13, book.isbn13);

  // Nothing proven: the deadline is a timeout, as before.
  const timedOut = await check({ checkAvailability: hangs, searchCatalog: hangs }, { deadlineAt: Date.now() + 50 });
  assert.equal(timedOut.error.code, 'CATALOG_TIMEOUT');
});

test('an inner timeout settling first still returns the proven catalog match', async () => {
  const hitDeadline = async () => {
    throw Object.assign(new Error('Inner lookup timed out'), { code: 'CATALOG_TIMEOUT' });
  };
  const provider = { checkAvailability: hitDeadline, searchCatalog: hitDeadline };
  const budget = { deadlineAt: Date.now() + 2_000 };
  const progress = { best: { ...proven, searchSummary: { partial: true } } };
  const kept = await check(provider, { ...budget, progress });
  assert.equal(kept.error, undefined);
  assert.equal(kept.response.catalogUrl, proven.catalogUrl);
  assert.equal((await check(provider, budget)).error.code, 'CATALOG_TIMEOUT');
});

test('conclude ends a running check with its proven match, and is ignored without one', async () => {
  const unproven = new AbortController();
  const pending = check({ checkAvailability: hangs, searchCatalog: hangs }, { deadlineAt: Date.now() + 300, progress: {}, conclude: unproven.signal });
  unproven.abort();
  const raced = await Promise.race([pending.then(() => 'settled'), new Promise(resolve => setTimeout(() => resolve('running'), 50))]);
  assert.equal(raced, 'running', 'nothing proven: the check carries on');
  assert.equal((await pending).error.code, 'CATALOG_TIMEOUT');

  const conclude = new AbortController();
  const progress = { best: { ...proven, searchSummary: { partial: true } } };
  const started = Date.now();
  const ended = check({ checkAvailability: hangs, searchCatalog: hangs }, { deadlineAt: Date.now() + 2_000, progress, conclude: conclude.signal });
  conclude.abort();
  assert.equal((await ended).response.outcome, 'available');
  assert.ok(Date.now() - started < 1_000);
});

test('at the deadline a title-and-author match answers unconfirmed with its catalog link, never found and never a timeout', async () => {
  const possible = { outcome: 'in_catalog', matchKind: 'possible_match', lookupKind: 'title_author', recognizedExact: false,
    catalogUrl: 'https://catalog.example/record/7', matchedBook: { title: book.title }, searchSummary: { partial: true } };
  const result = await check({ checkAvailability: hangs, searchCatalog: hangs }, { deadlineAt: Date.now() + 50, progress: { possible } });
  assert.equal(result.error, undefined);
  assert.equal(result.response.matchKind, 'possible_match');
  assert.equal(result.response.catalogUrl, 'https://catalog.example/record/7');
  const { answerFromResponse } = await import('./outcome.js');
  assert.deepEqual([answerFromResponse(result.response, { profile }).outcome, answerFromResponse(result.response, { profile }).reason], ['couldnt_check', 'unconfirmed']);
  // A possible match never ends the check early.
  const conclude = new AbortController(); conclude.abort();
  const pending = check({ checkAvailability: hangs, searchCatalog: hangs }, { deadlineAt: Date.now() + 80, progress: { possible }, conclude: conclude.signal });
  const started = Date.now(); await pending;
  assert.ok(Date.now() - started >= 60);
});
