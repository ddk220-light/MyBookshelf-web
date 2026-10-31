import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicAvailabilityService } from './availability.js';

const library = {
  id: 'koha:example', catalogUrl: 'https://catalog.example.test',
  capabilities: { catalogLookup: true, publicAvailability: true, copyCounts: true, locationAvailability: true, callNumber: true, catalogLink: true },
};
const entry = { id: 'koha:example', platform: 'koha', publicCatalogValidated: true };
const book = { bookKey: 'v1:isbn:9781625275868', isbn13: '9781625275868', title: 'Example', authors: ['Author'] };

function dependencies(provider, options = {}) {
  return {
    directory: { resolve: (id) => id === library.id ? library : null, entry: (id) => id === library.id ? entry : null },
    books: { resolve: async (key) => key === book.bookKey ? book : null },
    providerFor: () => provider,
    ...options,
  };
}

test('catalog record observations require proof of the selected record identity', async () => {
  const selected = { bookKey: 'v1:catalog:koha:example:42', title: 'Selected title', authors: [] };
  for (const observation of [
    { outcome: 'available', matchKind: 'catalog_record', availableCopies: 1 },
    { outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true },
    { status: 'available', availableCopies: 1 },
  ]) {
    const provider = { checkAvailability: async () => assert.fail('ISBN lookup must not run'), checkRecordAvailability: async () => observation };
    const service = createPublicAvailabilityService(dependencies(provider, { books: { resolve: async () => selected } }));
    const { response } = await service.check({ libraryId: library.id, bookKey: selected.bookKey });
    assert.equal(response.outcome, 'unknown');
    assert.equal(response.errorCode, 'CATALOG_UNRECOGNIZED');
    assert.equal(response.availableCopies, undefined);
  }
});

test('a book from another catalog uses its ISBN instead of reusing that catalog’s record number', async () => {
  const selected = { ...book, bookKey: 'v1:catalog:koha:another-library:42' };
  const provider = { checkRecordAvailability: async () => assert.fail('Foreign record must not be used'),
    checkAvailability: async isbn => {
      assert.equal(isbn, book.isbn13);
      return { outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true };
    } };
  const service = createPublicAvailabilityService(dependencies(provider, { books: { resolve: async () => selected } }));
  const { response } = await service.check({ libraryId: library.id, bookKey: selected.bookKey });
  assert.equal(response.lookupKind, 'exact_isbn');
  assert.equal(response.outcome, 'available');
});

test('work search recovers editions while exact-only search and stale caches remain isolated', async () => {
  let fail = false;
  const alternate = '9788173711466';
  const provider = { checkAvailability: async isbn => {
    if (fail) throw new Error('offline');
    return isbn === alternate ? { outcome: 'in_catalog', matchKind: 'exact_isbn', recognizedExact: true,
      catalogUrl: 'https://catalog.example.test/record/42' } : { outcome: 'not_found', matchKind: 'none', recognizedExact: true };
  } };
  const books = { resolve: async () => book, searchProfile: async () => ({ book, isbns: [book.isbn13, alternate],
    titles: [book.title], authors: book.authors, complete: true }) };
  const service = createPublicAvailabilityService(dependencies(provider, { books }));
  const input = { libraryId: library.id, bookKey: book.bookKey };
  const broad = (await service.check(input)).response;
  assert.equal(broad.outcome, 'in_catalog');
  assert.equal(broad.matchKind, 'verified_work');
  assert.equal(broad.matchedBook.isbn13, alternate);
  assert.equal(broad.catalogUrl, 'https://catalog.example.test/record/42');
  assert.equal((await service.check({ ...input, editionScope: 'exact' })).response.outcome, 'not_found');
  fail = true;
  assert.equal((await service.check(input)).response.outcome, 'in_catalog');
  assert.equal((await service.check(input)).response.freshness, 'stale');
  assert.equal((await service.check({ ...input, editionScope: 'exact' })).response.outcome, 'not_found');
});

test('metadata replay failures retain stale availability or a usable catalog handoff', async () => {
  let metadataFails = false;
  const options = dependencies({ checkAvailability: async () => ({ outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true, availableCopies: 2 }) },
    { books: { resolve: async () => {
      if (metadataFails) throw Object.assign(new Error('record timeout'), { code: 'CATALOG_TIMEOUT' });
      return book;
    } } });
  const service = createPublicAvailabilityService(options);
  assert.equal((await service.check({ libraryId: library.id, bookKey: book.bookKey })).response.freshness, 'fresh');
  metadataFails = true;
  const stale = await service.check({ libraryId: library.id, bookKey: book.bookKey });
  assert.equal(stale.response.freshness, 'stale');
  assert.equal(stale.response.availableCopies, 2);
  assert.equal(stale.response.errorCode, 'CATALOG_TIMEOUT');
  const cold = await createPublicAvailabilityService(options).check({ libraryId: library.id, bookKey: book.bookKey });
  assert.equal(cold.response.outcome, 'unknown');
  assert.equal(cold.response.errorCode, 'CATALOG_TIMEOUT');
  assert.equal(new URL(cold.response.catalogUrl).searchParams.get('q'), book.isbn13);
});

test('availability preserves public counts, locations, and exact-match truth', async () => {
  const provider = {
    checkAvailability: async () => ({
      outcome: 'available', lookupKind: 'exact_isbn', matchKind: 'exact_isbn', recognizedExact: true,
      availableCopies: 2, totalCopies: 3, callNumber: 'QA 76',
      locations: [{ name: 'Main', availableCopies: 2, totalCopies: 3, status: 'available' }],
      catalogUrl: 'https://catalog.example.test/record/1',
      attribution: { label: 'Public provider', url: 'https://provider.example.test/' },
    }),
  };
  const service = createPublicAvailabilityService(dependencies(provider));
  const result = await service.check({ libraryId: library.id, bookKey: book.bookKey });
  assert.equal(result.response.outcome, 'available');
  assert.equal(result.response.matchKind, 'exact_isbn');
  assert.equal(result.response.freshness, 'fresh');
  assert.equal(result.response.availableCopies, 2);
  assert.equal(result.response.locations[0].name, 'Main');
  assert.equal(result.response.locations[0].status, 'available');
  assert.equal(result.response.catalogUrl, 'https://catalog.example.test/record/1');
  assert.equal(result.response.catalogLinkKind, 'record');
  assert.deepEqual(result.response.attribution, { label: 'Public provider', url: 'https://provider.example.test/' });
});

test('unrecognized not-found stays unknown and failures retain last known truth as stale', async () => {
  let fail = false;
  const provider = {
    checkAvailability: async () => {
      if (fail) throw Object.assign(new Error('timeout'), { name: 'AbortError' });
      return { outcome: 'none_available', matchKind: 'exact_isbn', recognizedExact: true };
    },
  };
  let now = Date.parse('2026-08-03T12:00:00.000Z');
  const service = createPublicAvailabilityService(dependencies(provider, { now: () => now }));
  const first = await service.check({ libraryId: library.id, bookKey: book.bookKey });
  fail = true;
  now += 1000;
  const stale = await service.check({ libraryId: library.id, bookKey: book.bookKey });
  assert.equal(first.response.outcome, 'none_available');
  assert.equal(stale.response.outcome, 'none_available');
  assert.equal(stale.response.freshness, 'stale');
  assert.equal(stale.response.errorCode, 'CATALOG_TIMEOUT');

  const unknownProvider = { checkAvailability: async () => ({ outcome: 'not_found', matchKind: 'none', recognizedExact: false }) };
  const unknown = await createPublicAvailabilityService(dependencies(unknownProvider)).check({ libraryId: library.id, bookKey: book.bookKey });
  assert.equal(unknown.response.outcome, 'unknown');
  assert.equal(unknown.response.matchKind, null);
  assert.equal(unknown.response.freshness, 'none');
  assert.equal(unknown.response.catalogUrl, 'https://catalog.example.test/cgi-bin/koha/opac-search.pl?idx=nb&q=9781625275868');
  assert.equal(unknown.response.catalogLinkKind, 'search');
});

test('unlinked library reports unsupported without a provider call', async () => {
  let calls = 0;
  const unlinked = { ...library, capabilities: { ...library.capabilities, publicAvailability: false } };
  const service = createPublicAvailabilityService({
    directory: { resolve: () => unlinked, entry: () => entry },
    books: { resolve: async () => book },
    providerFor: () => ({ checkAvailability: async () => { calls += 1; } }),
  });
  const result = await service.check({ libraryId: library.id, bookKey: book.bookKey });
  assert.equal(result.response.errorCode, 'CATALOG_UNSUPPORTED');
  assert.equal(result.response.catalogUrl, 'https://catalog.example.test/cgi-bin/koha/opac-search.pl?idx=nb&q=9781625275868');
  assert.equal(result.response.catalogLinkKind, 'search');
  assert.equal(calls, 0);
});

test('confirmed non-lending copies keep their restriction without claiming borrowable availability', async () => {
  const observation = { outcome: 'unknown', matchKind: 'exact_isbn', recognizedExact: true,
    totalCopies: 3, loanRestriction: 'not_for_loan', callNumber: '630.954 ALI' };
  for (const [change, expected] of [[{}, 'not_for_loan'], [{ availableCopies: 1 }, undefined],
    [{ totalCopies: 0 }, undefined], [{ recognizedExact: false }, undefined], [{ matchKind: 'possible_match' }, undefined]]) {
    const provider = { checkAvailability: async () => ({ ...observation, ...change }) };
    const result = await createPublicAvailabilityService(dependencies(provider)).check({ libraryId: library.id, bookKey: book.bookKey });
    assert.equal(result.response.loanRestriction, expected);
    assert.equal(result.response.outcome, 'unknown');
  }
});

test('catalog title enrichment needs independently verified ISBN metadata', async () => {
  for (const [recognizedExact, expected] of [[true, 'பரமார்த்த குரு கதைகள்'], [false, undefined]]) {
    const provider = { checkAvailability: async () => ({ outcome: 'available', matchKind: 'exact_isbn', recognizedExact,
      catalogTitle: 'பரமார்த்த குரு கதைகள்', availableCopies: 1 }) };
    const result = await createPublicAvailabilityService(dependencies(provider)).check({ libraryId: library.id, bookKey: book.bookKey });
    assert.equal(result.response.catalogTitle, expected);
  }
});

test('completed unknown holdings keep attribution and do not replace a confirmed cached result', async () => {
  const attribution = { label: 'Calil', url: 'https://calil.jp/' };
  let calls = 0;
  const provider = { checkAvailability: async () => {
    calls += 1;
    if (calls === 1) return { outcome: 'available', matchKind: 'exact_isbn', availableCopies: 1 };
    if (calls === 2) return { outcome: 'unknown', matchKind: 'exact_isbn', recognizedExact: true,
      locations: [{ name: 'Main', status: 'unknown' }], attribution,
      catalogUrl: 'https://catalog.example.test/record/1' };
    throw new Error('timeout');
  } };
  const service = createPublicAvailabilityService(dependencies(provider));
  const request = { libraryId: library.id, bookKey: book.bookKey };
  await service.check(request);
  const unknown = (await service.check(request)).response;
  assert.equal(unknown.outcome, 'unknown');
  assert.equal(unknown.matchKind, 'exact_isbn');
  assert.equal(unknown.locations[0].status, 'unknown');
  assert.equal(unknown.catalogLinkKind, 'record');
  assert.deepEqual(unknown.attribution, attribution);
  const stale = (await service.check(request)).response;
  assert.equal(stale.outcome, 'available');
  assert.equal(stale.freshness, 'stale');
  assert.equal(stale.availableCopies, 1);
});

test('provider failure and unsupported checks retain library attribution', async () => {
  const attribution = { label: 'Calil', url: 'https://calil.jp/' };
  for (const supported of [true, false]) {
    const attributed = { ...library, attribution,
      capabilities: { ...library.capabilities, publicAvailability: supported } };
    const service = createPublicAvailabilityService(dependencies({ checkAvailability: async () => { throw new Error('timeout'); } }, {
      directory: { resolve: () => attributed, entry: () => entry },
    }));
    const result = await service.check({ libraryId: library.id, bookKey: book.bookKey });
    assert.equal(result.response.outcome, 'unknown');
    assert.deepEqual(result.response.attribution, attribution);
  }
});


test('aggregated catalog observations preserve a search link instead of calling it a single record', async () => {
  const provider = {checkAvailability: async () => ({outcome:'available',matchKind:'exact_isbn',recognizedExact:true,
    totalCopies:2,availableCopies:1,catalogUrl:'https://catalog.example.test/cgi-bin/koha/opac-search.pl?idx=nb&q=9781625275868',catalogLinkKind:'search'})};
  const result = await createPublicAvailabilityService(dependencies(provider)).check({libraryId:library.id,bookKey:book.bookKey});
  assert.equal(result.response.outcome, 'available');
  assert.equal(result.response.catalogLinkKind, 'search');
  assert.equal(result.response.totalCopies, 2);
});

test('work matching preserves reference-only editions and strips unverified circulation counts', async () => {
  for (const hasIsbn of [true, false]) {
    const provider = { checkAvailability: async () => ({ outcome: 'not_found', matchKind: 'none', recognizedExact: true }),
      searchCatalog: async () => ({ records: [{ recordId: '42' }], hasMore: false }),
      resolveCatalogRecord: async () => ({ title: book.title, authors: book.authors, ...(hasIsbn ? { isbn13: book.isbn13 } : {}),
        observation: { outcome: 'unknown', matchKind: 'catalog_record', recognizedRecord: true,
          totalCopies: 2, notForLoanCopies: 2, loanRestriction: 'not_for_loan', locations: [{ name: 'Reference room', totalCopies: 2 }] } }),
    };
    const books = { resolve: async () => book, searchProfile: async () => ({ book, isbns: [book.isbn13], titles: [book.title], authors: book.authors, complete: true }) };
    const result = (await createPublicAvailabilityService(dependencies(provider, { books })).check({ libraryId: library.id, bookKey: book.bookKey })).response;
    assert.equal(result.matchKind, hasIsbn ? 'exact_isbn' : 'possible_match');
    assert.equal(result.loanRestriction, hasIsbn ? 'not_for_loan' : undefined);
    assert.equal(result.totalCopies, hasIsbn ? 2 : undefined);
    assert.equal(result.availableCopies, undefined);
    if (!hasIsbn) assert.equal(result.locations, undefined);
  }
});
