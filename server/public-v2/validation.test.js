import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAvailability, parseBookSearch, parseLibraryBrowse, parseLibraryResolve, PublicV2ValidationError } from './validation.js';

test('book search accepts bounded page offsets and rejects malformed pagination', () => {
  assert.equal(parseBookSearch({ query: 'Wings of Fire', offset: 40 }).offset, 40);
  for (const offset of [-1, 0.5, '40', 100001, null]) assert.throws(() => parseBookSearch({ query: 'Wings of Fire', offset }), PublicV2ValidationError);
});

test('numeric book titles remain searchable while malformed ISBNs remain invalid', () => {
  assert.equal(parseBookSearch({ query: '1984' }).isbnLike, false);
  assert.equal(parseBookSearch({ query: '2001' }).isbnLike, false);
  assert.equal(parseBookSearch({ query: '9788173711466' }).isbn13, '9788173711466');
  assert.equal(parseBookSearch({ query: '9788173711467' }).isbnLike, true);
  assert.equal(parseBookSearch({ query: '9788173711467' }).isbn13, null);
});

test('availability accepts bounded edition preferences and rejects exact mode for a work key', () => {
  const base = { libraryId: 'bc:smcl', bookKey: 'v1:isbn:9788173711466' };
  assert.equal(parseAvailability({ ...base, editionScope: 'work', language: 'hin' }).language, 'hin');
  assert.throws(() => parseAvailability({ ...base, language: 'unbounded-language' }), PublicV2ValidationError);
  assert.throws(() => parseAvailability({ ...base, editionScope: 'all' }), PublicV2ValidationError);
  assert.throws(() => parseAvailability({ ...base, bookKey: 'v1:openlibrary:OL1037811W', editionScope: 'exact' }), PublicV2ValidationError);
});

test('regional browse requires a country and region and bounds pagination', () => {
  assert.deepEqual(parseLibraryBrowse({ country: 'in', region: ' Tamil Nadu ' }), { country: 'IN', region: 'Tamil Nadu', offset: 0, limit: 25 });
  for (const body of [null, {}, { country: 'India', region: 'Tamil Nadu' }, { country: 'IN', region: '' }, { country: 'IN', region: 'Tamil Nadu', offset: -1 }, { country: 'IN', region: 'Tamil Nadu', offset: 1.5 }, { country: 'IN', region: 'Tamil Nadu', limit: 26 }]) {
    assert.throws(() => parseLibraryBrowse(body), PublicV2ValidationError);
  }
});

test('public library IDs preserve documented provider-system casing', () => {
  assert.deepEqual(parseLibraryResolve({ libraryId: 'calil:Tokyo_Setagaya' }), { libraryId: 'calil:Tokyo_Setagaya' });
  assert.deepEqual(
    parseAvailability({ libraryId: 'calil:Tokyo_Setagaya', bookKey: 'v1:isbn:9784103534228' }),
    { libraryId: 'calil:Tokyo_Setagaya', bookKey: 'v1:isbn:9784103534228', parsed: { version: 'v1', kind: 'isbn', isbn13: '9784103534228' } },
  );
  assert.throws(() => parseLibraryResolve({ libraryId: 'calil:Tokyo.Setagaya' }), PublicV2ValidationError);
});
