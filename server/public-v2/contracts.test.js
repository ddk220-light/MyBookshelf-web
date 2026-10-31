import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PUBLIC_V2_AVAILABILITY_OUTCOMES,
  PUBLIC_V2_CAPABILITY_KEYS,
  PUBLIC_V2_FRESHNESS,
  PUBLIC_V2_LOOKUP_KINDS,
  PUBLIC_V2_MATCH_KINDS,
  createPublicBookKey,
  createCatalogBookKey,
  isPublicBookKey,
  parsePublicBookKey,
  publicError,
} from './contracts.js';
import { createRedactedTelemetrySink } from './telemetry.js';
import { PUBLIC_V2_FIXTURES } from '../test/fixtures/v2/public-contracts.js';

test('public v2 book keys are canonical, deterministic, and reject tampering', () => {
  assert.equal(
    createPublicBookKey({ isbn: '978-1625275868' }),
    'v1:isbn:9781625275868',
  );
  assert.equal(
    createPublicBookKey({ source: 'openlibrary', sourceRecordId: 'OL12345W' }),
    'v1:openlibrary:OL12345W',
  );
  assert.deepEqual(parsePublicBookKey('v1:isbn:9781625275868'), {
    version: 'v1', kind: 'isbn', isbn13: '9781625275868',
  });
  for (const value of ['v1:isbn:9781625275869', 'v1:unknown:1', 'v1:openlibrary:bad.id', 'https://example.test']) {
    assert.equal(isPublicBookKey(value), false);
  }
  assert.throws(() => createPublicBookKey({ source: 'unknown', sourceRecordId: '1' }));
});

test('frozen fixtures expose only the public library and book DTO shape', () => {
  const { supported, unsupported } = PUBLIC_V2_FIXTURES.librarySearch;
  for (const library of [supported, unsupported]) {
    assert.deepEqual(Object.keys(library.capabilities).sort(), [...PUBLIC_V2_CAPABILITY_KEYS].sort());
    assert.ok(['operational', 'degraded', 'unknown'].includes(library.health));
  }

  const book = PUBLIC_V2_FIXTURES.books.isbnExact.result;
  assert.ok(isPublicBookKey(book.bookKey));
  const serialized = JSON.stringify(book).toLowerCase();
  for (const forbidden of ['cardnumber', 'pin', 'loan', 'hold', 'shelf', 'upload', 'imagepath', 'owner']) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} must not be a public field`);
  }
});

test('availability fixtures preserve outcome, match, and freshness truth semantics', () => {
  for (const value of Object.values(PUBLIC_V2_FIXTURES.availability)) {
    assert.ok(PUBLIC_V2_AVAILABILITY_OUTCOMES.includes(value.outcome));
    assert.ok(PUBLIC_V2_LOOKUP_KINDS.includes(value.lookupKind));
    assert.ok(PUBLIC_V2_MATCH_KINDS.includes(value.matchKind));
    assert.ok(PUBLIC_V2_FRESHNESS.includes(value.freshness));
    assert.ok(value.attemptedAt);
    if (value.freshness === 'none') assert.equal(value.observedAt, undefined);
    else assert.ok(value.observedAt);
  }
  assert.equal(PUBLIC_V2_FIXTURES.availability.verifiedNotFound.matchKind, 'none');
  assert.equal(PUBLIC_V2_FIXTURES.availability.timeout.matchKind, null);
  assert.equal(PUBLIC_V2_FIXTURES.availability.stale.freshness, 'stale');
});

test('public errors and telemetry cannot carry identity or raw lookup data', () => {
  assert.deepEqual(publicError('INVALID_REQUEST', 'Use an ISBN, title, or author.'), {
    error: { code: 'INVALID_REQUEST', message: 'Use an ISBN, title, or author.' },
  });
  assert.throws(() => publicError('INTERNAL_ERROR', 'no'));

  const sink = createRedactedTelemetrySink();
  sink.emit({ operation: 'availability', provider: 'koha', outcome: 'unknown', durationMs: 120 });
  assert.equal(sink.events().length, 1);
  for (const event of [
    { operation: 'search', query: 'private title' },
    { operation: 'availability', cookie: 'mb_session=secret' },
    { operation: 'availability', credentials: 'secret' },
    { operation: 'availability', recentBooks: ['v1:isbn:9781625275868'] },
    { operation: 'availability', ipAddress: '127.0.0.1' },
    { operation: 'availability', upstreamUrl: 'https://catalog.example.test' },
  ]) {
    assert.throws(() => sink.emit(event));
  }
});


test('catalog identities support composite and replay IDs without accepting URLs or noncanonical encoding', () => {
  for (const recordId of ['123', 'tsskoha.20192', 'a1_abc-XYZ_123', 'alt.123456789abc.tsskoha.20192', 'x'.repeat(210)]) {
    const key = createCatalogBookKey('vufind:somaiya-tss', recordId);
    assert.deepEqual(parsePublicBookKey(key), { version: 'v1', kind: 'catalog', libraryId: 'vufind:somaiya-tss', recordId });
    assert.equal(parsePublicBookKey(key + '='), null);
  }
  for (const recordId of ['https://other.invalid/record/1', '../1', '/1', 'a?x=1', 'a\nb', 'x'.repeat(211)]) {
    assert.throws(() => createCatalogBookKey('vufind:somaiya-tss', recordId));
  }
});
