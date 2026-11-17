import test from 'node:test';
import assert from 'node:assert/strict';
import { bookEligibility, verifiedKohaBooks } from './koha-run.mjs';

test('Koha audit excludes serials and ambiguous bound volumes while preserving general and reference books', () => {
  for (const format of ['BOUND VOLUME', 'Journals', 'Magazine', 'Reference periodicals', 'Non-Book Materials']) assert.equal(bookEligibility({ observation: { format } }).eligibleBook, false);
  for (const format of ['GENERAL', 'REFRENCE', 'Technical Reference Book']) assert.equal(bookEligibility({ observation: { format } }).eligibleBook, true);
  assert.equal(bookEligibility({}).eligibleBook, null);
});

test('audit counts a distinct scoped book only after query, resolution and live app confirmation', () => {
  const book = { recordId: '42', title: 'Test book', eligibleBook: true, queriedRecordFound: true, resolvedRecordFound: true, lookup: { outcome: 'found', source: 'live' } };
  assert.equal(verifiedKohaBooks([book, { ...book }, { ...book, recordId: '43' }]).length, 1);
  for (const change of [{ eligibleBook: false }, { eligibleBook: null }, { queriedRecordFound: false }, { resolvedRecordFound: false }, { lookup: { outcome: 'couldnt_check', source: 'live' } }, { lookup: { outcome: 'found', source: 'stored' } }]) assert.equal(verifiedKohaBooks([{ ...book, ...change }]).length, 0);
});
