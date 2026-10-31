import assert from 'node:assert/strict';
import test from 'node:test';
import libraries from '../data/libraries.json' with { type: 'json' };
import { catalogHandoffFor } from './catalog-handoff.js';

const book = {
  isbn13: '9781625275868',
  title: 'Your Strategy Needs a Strategy',
  authors: ['Martin Reeves'],
};

test('catalog handoffs use trusted, platform-specific public search routes', () => {
  assert.deepEqual(catalogHandoffFor({
    entry: { platform: 'bc', catalogUrl: 'https://burlingame.bibliocommons.com/' }, book,
  }), {
    catalogUrl: 'https://burlingame.bibliocommons.com/search?query=9781625275868&searchType=keyword',
    catalogLinkKind: 'search',
  });
  assert.deepEqual(catalogHandoffFor({
    entry: { platform: 'aspen', catalogUrl: 'https://discover.cuyahogalibrary.org/' }, book,
  }), {
    catalogUrl: 'https://discover.cuyahogalibrary.org/Search/Results?lookfor=9781625275868&searchIndex=ISBN',
    catalogLinkKind: 'search',
  });
  assert.deepEqual(catalogHandoffFor({
    entry: { platform: 'koha', catalogUrl: 'http://118.185.210.241:8001' }, book,
  }), {
    catalogUrl: 'http://118.185.210.241:8001/cgi-bin/koha/opac-search.pl?idx=nb&q=9781625275868',
    catalogLinkKind: 'search',
  });
});

test('catalog handoffs fall back to the trusted catalog home when no route is proven', () => {
  assert.deepEqual(catalogHandoffFor({
    entry: { platform: 'vega', catalogUrl: 'https://borrow.nypl.org/' }, book,
  }), {
    catalogUrl: 'https://borrow.nypl.org/',
    catalogLinkKind: 'catalog',
  });
  assert.equal(catalogHandoffFor({ entry: { catalogUrl: 'javascript:alert(1)' }, book }), null);
  assert.equal(catalogHandoffFor({ entry: { catalogUrl: 'https://user:password@catalog.example/' }, book }), null);
});

test('every directory entry has a browser catalog handoff', () => {
  const missing = libraries.filter((entry) => !catalogHandoffFor({ entry, book }));
  assert.deepEqual(missing, []);
});

test('e-Granthalaya handoff opens the selected member without exposing its anonymous session', () => {
  assert.deepEqual(catalogHandoffFor({ entry: {
    platform: 'egranthalaya', catalogUrl: 'https://eg4.nic.in/OPAC/Default.aspx?CL_NAME=UPLIBRARIES',
    egranthalayaCluster: 'UPLIBRARIES', egranthalayaLibraryCode: 'SCLALD',
  }, book: { isbn13: '9788173711466' } }), {
    catalogUrl: 'https://eg4.nic.in/OPAC/Default.aspx?CL_NAME=UPLIBRARIES&LIB_CODE=SCLALD', catalogLinkKind: 'catalog',
  });
});
