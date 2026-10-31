import test from 'node:test';
import assert from 'node:assert/strict';
import { providerWithAlternates } from './index.js';

const library = { platform: 'old', alternateCatalogs: [{ platform: 'new', sourceConnectionId: 'source:one', preferForLookup: true }] };
test('alternate records reopen on their original route after provider order changes', async () => {
  const forRoute = entry => ({ searchCatalog: async () => [{ recordId: '123', title: entry.platform }],
    resolveCatalogRecord: async id => ({ recordId: id, title: entry.platform }) });
  const provider = providerWithAlternates(library, forRoute);
  const [record] = await provider.searchCatalog('book');
  assert.equal(record.title, 'new');
  assert.match(record.recordId, /^alt\.[a-f0-9]{12}\.123$/);
  const afterRestart = providerWithAlternates({ ...library, alternateCatalogs: library.alternateCatalogs.map(r => ({ ...r, preferForLookup: false })) }, forRoute);
  assert.equal((await afterRestart.resolveCatalogRecord(record.recordId)).title, 'new');
  assert.equal((await afterRestart.resolveCatalogRecord('123')).title, 'old');
  await assert.rejects(() => afterRestart.resolveCatalogRecord('alt.000000000000.123'), /Unknown catalog route/);
});

test('empty alternate responses cannot hide failures or indeterminate ownership', async () => {
  const failed = providerWithAlternates(library, entry => ({
    searchCatalog: async () => { if (entry.platform === 'new') throw new Error('source unavailable'); return []; },
    checkAvailability: async () => { if (entry.platform === 'new') throw new Error('source unavailable'); return { outcome: 'not_found', recognizedExact: true, matchKind: 'none' }; },
  }));
  await assert.rejects(() => failed.searchCatalog('book'), /source unavailable/);
  await assert.rejects(() => failed.checkAvailability('9788173711466'), /source unavailable/);
  const partial = providerWithAlternates(library, entry => ({ checkAvailability: async () => ({ outcome: entry.platform === 'new' ? 'unknown' : 'not_found' }) }));
  assert.equal((await partial.checkAvailability('9788173711466')).outcome, 'unknown');
});

test('a confirmed alternate holding survives failure of the other route', async () => {
  const provider = providerWithAlternates(library, entry => ({ checkAvailability: async () => {
    if (entry.platform === 'new') throw new Error('temporary failure');
    return { outcome: 'in_catalog', matchKind: 'exact_isbn', recognizedExact: true };
  } }));
  assert.equal((await provider.checkAvailability('9788173711466')).outcome, 'in_catalog');
});

test('a preferred title-only match cannot hide exact edition evidence from the retained route', async () => {
  const calls = [];
  const provider = providerWithAlternates(library, entry => ({ checkAvailability: async () => {
    calls.push(entry.platform);
    return { outcome: 'in_catalog', matchKind: entry.platform === 'new' ? 'possible_match' : 'exact_isbn', recognizedExact: entry.platform === 'old' };
  } }));
  assert.equal((await provider.checkAvailability('9788173711466', 'Wings of Fire')).matchKind, 'exact_isbn');
  assert.deepEqual(calls, ['new', 'old']);
});
