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
