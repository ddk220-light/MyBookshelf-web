import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkPublicAvailability, parseIithRecord, IITH_CATALOG_ORIGIN } from './iithKoha.js';
import { getProvider } from './index.js';
import { clearHttpCache } from './http.js';
import { catalogHandoffFor } from '../../public-v2/catalog-handoff.js';
const isbn = '9780521663502';
const library = { platform: 'koha', baseUrl: IITH_CATALOG_ORIGIN, catalogUrl: IITH_CATALOG_ORIGIN, publicCatalogApi: 'iith-opac-v1', capabilities: ['availability'] };
const detail = JSON.parse(fs.readFileSync(new URL('../../test/fixtures/koha/iith-api-detail.json', import.meta.url)));
const search = JSON.parse(fs.readFileSync(new URL('../../test/fixtures/koha/iith-api-search.json', import.meta.url)));
const originalFetch = global.fetch;
function json(url, data, status = 200) { return { url, status, ok: status === 200, headers: new Headers(), text: async () => JSON.stringify(data) }; }
afterEach(() => { global.fetch = originalFetch; clearHttpCache(); });

test('the public provider uses the observed JSON ISBN search and proves complete record holdings', async () => {
  const calls = [];
  global.fetch = async (url, options) => { calls.push([url, options]); return json(url, url.endsWith('/api/search') ? search : detail); };
  const result = await getProvider(library).checkAvailability(isbn);
  assert.equal(result.outcome, 'available'); assert.equal(result.totalCopies, 1); assert.equal(result.availableCopies, 1);
  assert.equal(result.callNumber, '005.73 OKA'); assert.equal(result.catalogUrl, `${IITH_CATALOG_ORIGIN}/book/139100`);
  assert.equal(calls.length, 2); assert.deepEqual(JSON.parse(calls[0][1].body), {query:isbn,type:'isbn',limit:8,offset:0});
  assert.match(calls[0][1].headers['User-Agent'], /MyBookshelf/);
});

test('reference, missing status and partial or duplicate item lists cannot become borrowable counts', () => {
  for (const patch of [{ notforloan: 1 }, { status: 'Unknown' }, { item_type_desc: 'Reference Books' }, { notforloan: undefined }, { item_type: 'EB' }]) {
    const r = parseIithRecord({ ...detail, items: [{ ...detail.items[0], ...patch }] }, isbn,139100);
    assert.equal(r.outcome, 'unknown'); assert.equal(r.availableCopies, undefined);
  }
  for(const patch of [{item_count:2}, {item_count:2,items:[detail.items[0],detail.items[0]]}]) {
    assert.equal(parseIithRecord({...detail,...patch},isbn,139100).totalCopies,undefined);
  }
  assert.equal(parseIithRecord({...detail, items:[{...detail.items[0],status:'Checked out'}]},isbn,139100).outcome,'none_available');
});

test('wrong record IDs and query-echo ISBNs never establish an exact book', () => {
  for (const patch of [{ biblio_id: 1 }, { isbn: '9780735219090', query: isbn }]) {
    assert.throws(() => parseIithRecord({ ...detail, ...patch }, isbn,139100), { code:'CATALOG_UNRECOGNIZED' });
  }
});

test('incomplete, duplicated, fuzzy and malformed search responses fail closed', async () => {
  for (const patch of [{total:9}, {total:2,books:[search.books[0],search.books[0]]}, {autoApplied:true}, {originalQuery:'another book'}, {books:null}, {books:[{...search.books[0],isbn:'9780735219090'}]}]) {
    global.fetch=async url=>json(url,{...search,...patch});
    await assert.rejects(checkPublicAvailability(library,isbn),{code:'CATALOG_UNRECOGNIZED'});
    clearHttpCache();
  }
});

test('refusals and redirects stop without retrying or following another origin', async () => {
  for (const status of [401,403,429,302]) {
    let calls=0;global.fetch=async url=>{calls++;return json(url,{},status)};
    await assert.rejects(checkPublicAvailability(library,isbn),{code:status===302?'CATALOG_UNAVAILABLE':'CATALOG_PROVIDER_BLOCKED'});
    assert.equal(calls,1);
  }
});

test('empty search checks the equivalent ISBN10 then reports unknown instead of falsely absent', async () => {
  const queries=[];global.fetch=async(url,options)=>{queries.push(JSON.parse(options.body).query);return json(url,{books:[],total:0,autoApplied:false,originalQuery:null})};
  const result=await checkPublicAvailability(library,isbn);
  assert.deepEqual(queries,[isbn,'0521663504']); assert.equal(result.outcome,'unknown');assert.equal(result.recognizedExact,false);
});

test('configuration pins the reviewed API origin and catalog handoff avoids the obsolete CGI path', async () => {
  global.fetch=()=>{throw Error('must not fetch')};
  await assert.rejects(checkPublicAvailability({...library,baseUrl:'https://another.example'},isbn),{code:'CATALOG_CONFIGURATION_REQUIRED'});
  assert.deepEqual(catalogHandoffFor({entry:library,book:{isbn13:isbn}}),{catalogUrl:`${IITH_CATALOG_ORIGIN}/`,catalogLinkKind:'catalog'});
});
