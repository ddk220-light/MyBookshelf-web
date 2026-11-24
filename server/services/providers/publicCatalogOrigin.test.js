import test from 'node:test';
import assert from 'node:assert/strict';
import { publicCatalogOrigin, isReviewedPublicHttpOrigin } from './publicCatalogOrigin.js';

const library = { id: 'koha:anna-centenary-library', platform: 'koha', baseUrl: 'http://118.185.210.241:8001' };

test('anonymous HTTP exceptions bind the library identity, host and port', () => {
  assert.equal(publicCatalogOrigin(library)?.origin, library.baseUrl);
  assert.equal(publicCatalogOrigin({ ...library, id: 'koha:kalaignar-centenary-library', baseUrl: 'http://122.184.84.190:1011' })?.origin, 'http://122.184.84.190:1011');
  assert.equal(isReviewedPublicHttpOrigin(library.id, library.baseUrl + '/cgi-bin/koha/opac-detail.pl?biblionumber=1'), true);
  for (const change of [
    { id: 'koha:other' }, { platform: 'catalog' },
    { baseUrl: 'http://118.185.210.241' }, { baseUrl: 'http://122.184.84.190:1011' },
    { baseUrl: 'http://127.0.0.1:8001' }, { baseUrl: 'http://169.254.169.254/' },
    { baseUrl: 'http://118.185.210.241:8001@127.0.0.1/' },
    { baseUrl: 'http://reader@118.185.210.241:8001/' },
    { baseUrl: library.baseUrl + '/account' }, { baseUrl: library.baseUrl + '?token=1' },
  ]) assert.equal(publicCatalogOrigin({ ...library, ...change }), null);
});

test('two TLC catalogs publish only HTTP: each origin is pinned to its library, port included', () => {
  const tangipahoa = { id: 'tlc:tangipahoa', platform: 'tlc', baseUrl: 'http://opac.tangipahoa.lib.la.us:8080/' };
  assert.equal(publicCatalogOrigin(tangipahoa)?.origin, 'http://opac.tangipahoa.lib.la.us:8080');
  assert.equal(publicCatalogOrigin({ id: 'tlc:nwrls', platform: 'tlc', baseUrl: 'http://ls2pac.nwrls.lib.fl.us/' })?.origin, 'http://ls2pac.nwrls.lib.fl.us');
  for (const change of [{ id: 'tlc:other' }, { platform: 'bc' }, { baseUrl: 'http://opac.tangipahoa.lib.la.us/' }, { baseUrl: 'http://ls2pac.nwrls.lib.fl.us/' }]) {
    assert.equal(publicCatalogOrigin({ ...tangipahoa, ...change }), null);
  }
  // Every other TLC catalog is https.
  assert.equal(publicCatalogOrigin({ id: 'tlc:lapl', platform: 'tlc', baseUrl: 'https://ls2pac.lapl.org/' })?.origin, 'https://ls2pac.lapl.org');
});
