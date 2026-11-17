import test from 'node:test';
import assert from 'node:assert/strict';
import { providerWithAlternates, withProviderRouteExecution } from './index.js';

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

test('route execution follows the existing fallback order without changing results', async () => {
  const calls = [];
  const provider = providerWithAlternates(library, entry => ({ checkAvailability: async () => {
    if (entry.platform === 'new') throw Object.assign(new Error('unavailable'), { code: 'CATALOG_UNAVAILABLE' });
    return { outcome: 'in_catalog', matchKind: 'exact_isbn', recognizedExact: true };
  } }));
  const result = await withProviderRouteExecution(async (route, task) => {
    calls.push(route);
    return task();
  }, () => provider.checkAvailability('9788173711466'));
  assert.equal(result.outcome, 'in_catalog');
  assert.deepEqual(calls.map(route => [route.entry.platform, route.method]), [['new', 'checkAvailability'], ['old', 'checkAvailability']]);
  assert.match(calls[0].prefix, /^alt\.[a-f0-9]{12}\.$/);
  assert.equal(calls[1].prefix, '');
  assert.deepEqual(provider.catalogRoutes.map(route => route.entry.platform), ['new', 'old']);
});

test('route metadata and execution preserve scoped record identities', async () => {
  const calls = [], opened = [];
  const provider = providerWithAlternates(library, entry => ({
    searchCatalog: async () => [{ recordId: '123', title: entry.platform }],
    resolveCatalogRecord: async id => { opened.push([entry.platform, id]); return { recordId: id, title: entry.platform }; },
  }));
  const result = await withProviderRouteExecution(async (route, task) => {
    calls.push([route.entry.platform, route.method]);
    return task();
  }, async () => {
    const [record] = await provider.searchCatalog('book');
    const selected = provider.catalogRouteForRecord(record.recordId);
    assert.equal(selected.entry.platform, 'new');
    assert.equal(record.recordId, selected.prefix + '123');
    const resolved = await provider.resolveCatalogRecord(record.recordId);
    assert.equal(resolved.recordId, record.recordId);
    return resolved;
  });
  assert.equal(result.title, 'new');
  assert.deepEqual(opened, [['new', '123']]);
  assert.deepEqual(calls, [['new', 'searchCatalog'], ['new', 'resolveCatalogRecord']]);
  assert.equal(provider.catalogRouteForRecord('123').entry.platform, 'old');
  assert.throws(() => provider.catalogRouteForRecord('alt.000000000000.123'), { code: 'CATALOG_UNRECOGNIZED' });
});

test('concurrent execution scopes remain independent and do not leak to ordinary calls', async () => {
  const provider = providerWithAlternates(library, entry => ({ searchCatalog: async () => {
    await new Promise(resolve => setImmediate(resolve));
    return entry.platform === 'new' ? [] : [{ recordId: '123', title: 'book' }];
  } }));
  const a = [], b = [];
  const run = calls => withProviderRouteExecution(async (route, task) => {
    calls.push(route.entry.platform);
    return task();
  }, () => provider.searchCatalog('book'));
  await Promise.all([run(a), run(b)]);
  await provider.searchCatalog('book');
  assert.deepEqual(a, ['new', 'old']);
  assert.deepEqual(b, ['new', 'old']);
});

test('inherited primary methods execute on the primary route and retain their receiver', async () => {
  const calls = [];
  const provider = providerWithAlternates(library, entry => ({ label: entry.platform,
    searchResultRows() { return [{ title: this.label }]; },
  }));
  const rows = await withProviderRouteExecution(async (route, task) => {
    calls.push([route.entry.platform, route.prefix, route.method]);
    return task();
  }, () => provider.searchResultRows('book'));
  assert.deepEqual(rows, [{ title: 'old' }]);
  assert.deepEqual(calls, [['old', '', 'searchResultRows']]);
});

test('a primary record checker reopens alternate records on their own resolver', async () => {
  const calls = [], opened = [];
  const provider = providerWithAlternates(library, entry => entry.platform === 'old' ? {
    checkRecordAvailability: async id => { opened.push(['old', id]); return { outcome: 'not_found' }; },
  } : {
    searchCatalog: async () => [{ recordId: '123', title: 'book' }],
    resolveCatalogRecord: async id => { opened.push(['new', id]); return { recordId: id, observation: { outcome: 'in_catalog' } }; },
  });
  const [record] = await provider.searchCatalog('book');
  const result = await withProviderRouteExecution(async (route, task) => {
    calls.push([route.entry.platform, route.method]);
    return task();
  }, () => provider.checkRecordAvailability(record.recordId));
  assert.equal(result.outcome, 'in_catalog');
  assert.deepEqual(opened, [['new', '123']]);
  assert.deepEqual(calls, [['new', 'resolveCatalogRecord']]);
  assert.equal((await provider.checkRecordAvailability('456')).outcome, 'not_found');
  assert.deepEqual(opened[1], ['old', '456']);
  const withoutPrimaryChecker = providerWithAlternates(library, () => ({ resolveCatalogRecord: async () => null }));
  assert.equal(withoutPrimaryChecker.checkRecordAvailability, undefined);
});

test('providers without available alternates retain their original object and behavior', async () => {
  const primary = { checkAvailability: async () => ({ outcome: 'unknown' }) };
  const provider = providerWithAlternates({ platform: 'old' }, () => primary);
  let routed = false;
  assert.equal(provider, primary);
  assert.equal(provider.catalogRoutes, undefined);
  await withProviderRouteExecution(() => { routed = true; }, () => provider.checkAvailability('9788173711466'));
  assert.equal(routed, false);
});
