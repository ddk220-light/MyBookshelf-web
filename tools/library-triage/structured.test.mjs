import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseKohaRss,parseVuFindApi,SharedSearchService } from './structured.mjs';
import { EvidenceStore } from '../../server/services/catalog-connectors/evidence.js';
import { Coordinator } from '../../server/services/catalog-connectors/transport.js';
import { ConnectorService } from '../../server/services/catalog-connectors/service.js';
import { hash } from '../../server/services/catalog-connectors/contracts.js';
const rss='<rss version="2.0" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"><channel><opensearch:totalResults>1</opensearch:totalResults><item><title>History &amp; culture</title><link>https://test.invalid/cgi-bin/koha/opac-detail.pl?biblionumber=123</link></item></channel></rss>';
test('RSS parser preserves order, native identities, titles and totals',()=>{
 const p=parseKohaRss(rss,'https://test.invalid');assert.equal(p.total,1);assert.equal(p.records[0].recordId,'123');assert.equal(p.records[0].title,'History & culture');
 assert.throws(()=>parseKohaRss(rss.replace('https://test.invalid/cgi','https://foreign.invalid/cgi'),'https://test.invalid'),/origin mismatch/);
 assert.throws(()=>parseKohaRss('<html>Login</html>','https://test.invalid'),/not a Koha RSS/);
 assert.throws(()=>parseKohaRss('<!DOCTYPE rss>'+rss,'https://test.invalid'),/declarations/);
});
test('five previously archived provider RSS responses replay with their native IDs; never live',()=>{
 const root=new URL('../../docs/research/india-library-audit/koha-interface-check-20261108/',import.meta.url);
 const analysis=JSON.parse(readFileSync(new URL('analysis.json',root)));
 let tested=0;
 for(const l of analysis.libraries){
  const evidence=l.firstPage.rss?.evidence;
  if(!evidence)continue;
  const body=readFileSync(new URL(evidence.path,root),'utf8');assert.equal(hash(body),evidence.sha256);
  const p=parseKohaRss(body,l.origin);assert.deepEqual(p.records.map(r=>r.recordId),l.firstPage.rss.items.map(r=>r.id));tested++;
 }
 assert.equal(tested,5);
});
test('VuFind parses native data, recognizes empty and rejects login/error responses',()=>{
 const entry={baseUrl:'https://test.invalid/vufind'};
 const p=parseVuFindApi(JSON.stringify({status:'OK',resultCount:1,records:[{id:'123.ab',title:'History'}]}),entry);
 assert.equal(p.records[0].catalogUrl,'https://test.invalid/vufind/Record/123.ab');
 assert.equal(parseVuFindApi('{"status":"OK","resultCount":0}',entry).records.length,0);
 assert.throws(()=>parseVuFindApi('{"status":"UNAUTHORIZED"}',entry),/permission/);
 assert.throws(()=>parseVuFindApi('{"status":"OK","resultCount":12}',entry),/Unrecognized/);
 assert.throws(()=>parseVuFindApi('<html>Login</html>',entry),/JSON/);
});
test('structured wrapper keeps Koha branch filter and signs provider native IDs through governed transport',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'structured-test-')),store=new EvidenceStore(dir);store.acquire();t.after(()=>{store.release();rmSync(dir,{recursive:true,force:true});});
 const urls=[];
 const coordinator=new Coordinator({store,robots:false,minGapMs:0,fetchImpl:async url=>{urls.push(new URL(url));return new Response(rss,{headers:{'Content-Type':'application/rss+xml'}});}});
 const entry={platform:'koha',baseUrl:'https://test.invalid',catalogUrl:'https://test.invalid/',kohaBranchCode:'ONE',kohaBranchName:'One'};
 const native=new ConnectorService({coordinator,secret:'test-only-0123456789abcdef0123456789abcdef',lookup:()=>entry}),service=new SharedSearchService(native);
 const result=await service.search({libraryId:'koha:test',connectionId:'primary',query:'History'});
 assert.equal(urls[0].searchParams.get('limit'),'branch:ONE');assert.equal(urls[0].searchParams.get('format'),'rss');
 assert.equal(native.refs.read(result.records[0].recordRef).recordId,'123');assert.equal(result.observationKind,'fixture');assert.ok(result.evidence.length);
});
test('IndCat scope gap stops before provider traffic; no unscoped hit can pass',()=>{
 let requests=0;const service=new SharedSearchService({connection:()=>({entry:{platform:'indcat'}}),execute:()=>requests++});
 assert.throws(()=>service.search({libraryId:'indcat:test'}),/institution-holdings/);assert.equal(requests,0);
});

test('VuFind API preserves institution and building filters in the documented base path',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'vufind-api-test-')),store=new EvidenceStore(dir);store.acquire();t.after(()=>{store.release();rmSync(dir,{recursive:true,force:true});});
 const urls=[];const coordinator=new Coordinator({store,robots:false,minGapMs:0,fetchImpl:async url=>{urls.push(new URL(url));return new Response('{"status":"OK","resultCount":1,"records":[{"id":"abc.123","title":"History"}]}',{headers:{'Content-Type':'application/json'}});}});
 const entry={platform:'vufind',baseUrl:'https://kalnet.kshec.kerala.gov.in/vufind',catalogUrl:'https://kalnet.kshec.kerala.gov.in/vufind/Search/Results',vufindInstitution:'MG University',vufindBuilding:'School of Biosciences'};
 const native=new ConnectorService({coordinator,secret:'test-only-0123456789abcdef0123456789abcdef',lookup:()=>entry});
 const result=await new SharedSearchService(native).search({libraryId:'vufind:test',connectionId:'primary',query:'History'});
 assert.equal(urls[0].pathname,'/vufind/api/v1/search');assert.deepEqual(urls[0].searchParams.getAll('filter[]'),['institution:"MG University"','building:"School of Biosciences"']);
 assert.deepEqual(urls[0].searchParams.getAll('field[]'),['id','title']);assert.equal(result.fidelity,'supported_structured_search');assert.equal(result.records[0].recordId,'abc.123');
});
test('disabled API is Needs work and never silently falls back to HTML',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'disabled-api-test-')),store=new EvidenceStore(dir);store.acquire();t.after(()=>{store.release();rmSync(dir,{recursive:true,force:true});});
 let calls=0;const coordinator=new Coordinator({store,robots:false,minGapMs:0,fetchImpl:async()=>{calls++;return new Response('Not found',{status:404});}});
 const entry={platform:'koha',baseUrl:'https://test.invalid',catalogUrl:'https://test.invalid/'};
 const native=new ConnectorService({coordinator,secret:'test-only-0123456789abcdef0123456789abcdef',lookup:()=>entry});native.search=()=>{throw Error('HTML fallback must not execute');};
 await assert.rejects(new SharedSearchService(native).search({libraryId:'koha:test',connectionId:'primary',query:'History'}),e=>e.code==='API_UNAVAILABLE');assert.equal(calls,1);
});
