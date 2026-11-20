import test from 'node:test';
import assert from 'node:assert/strict';
import { runBookCheck } from './check.js';
import { catalogOperation } from '../providers/http.js';

// The book check as the lookup layer runs it: the one library search, inside
// one catalog operation with the check's deadline. Fake providers only.
const book = { title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'], isbn13: '9788173711466' };
const library = { id: 'koha:test', catalogUrl: 'https://catalog.example/',
  capabilities: { publicAvailability: true, catalogLink: true, copyCounts: false, callNumber: false, locationAvailability: false } };
const entry = { id: 'koha:test', platform: 'koha', catalogUrl: 'https://catalog.example/' };
const row = { title: 'Wings of fire', catalogUrl: 'https://catalog.example/record/42', catalogLinkKind: 'record' };
const hangs = () => new Promise((resolve, reject) => {
  const signal = catalogOperation()?.signal;
  signal?.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { code: 'CATALOG_ABORTED' })), { once: true });
});
const check = (provider, budget, extra = {}) => runBookCheck({ entry, library, provider, book, bookKey: `v1:isbn:${book.isbn13}`, lookupKind: 'verified_work',
  editionScope: 'work', attemptedAt: new Date().toISOString(), budget, ...extra });

test('a check is one search; a title match is found with the record link', async () => {
  const terms = [];
  const result = await check({ search: async term => { terms.push(term); return [row]; } }, { deadlineAt: Date.now() + 1_000 });
  assert.deepEqual(terms, ['Wings of Fire']);
  assert.deepEqual([result.response.outcome, result.response.catalogUrl, result.response.matches.length], ['in_catalog', row.catalogUrl, 1]);
});

test('a search that does not answer by the deadline is a timeout', async () => {
  const timedOut = await check({ search: hangs }, { deadlineAt: Date.now() + 50 });
  assert.equal(timedOut.error.code, 'CATALOG_TIMEOUT');
});

test('the rows function given by the lookup layer stands in for the provider\'s search', async () => {
  const result = await check({ search: () => assert.fail('cached') }, { deadlineAt: Date.now() + 1_000 }, { rows: async () => [row] });
  assert.equal(result.response.outcome, 'in_catalog');
});
