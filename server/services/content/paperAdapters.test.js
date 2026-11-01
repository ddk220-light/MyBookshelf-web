import assert from 'node:assert/strict';
import test from 'node:test';
import {contentKey,parseContentKey,readingActions} from './contracts.js';
import {createDoajAdapter,mapDoaj} from './doaj.js';
import {createArxivAdapter,parseArxivFeed} from './arxiv.js';
import {createOpenalexAdapter,mapOpenalex} from './openalex.js';
const observedAt='2026-11-01T09:00:00Z',now=()=>Date.parse(observedAt);
// Explicit synthetic protocol fixtures, never production catalog entries.
const article={id:'a'.repeat(32),bibjson:{title:'Synthetic DOAJ fixture',author:[{name:'Fixture Author'}],
  identifier:[{type:'doi',id:'10.5555/fixture'}],journal:{title:'Fixture journal',language:['EN']},
  link:[{type:'fulltext',content_type:'text/html',url:'https://publisher.example/article'},
    {type:'fulltext',content_type:'application/pdf',url:'javascript:bad'},
    {type:'abstract',url:'https://publisher.example/abstract'}],year:'2026'}};
const work={id:'https://openalex.org/W12345',type:'review',title:'Synthetic OpenAlex fixture',language:'en',doi:'https://doi.org/10.5555/fixture',
  is_retracted:true,authorships:[{author:{display_name:'Fixture Author'}}],open_access:{is_oa:true},
  locations:[{landing_page_url:'https://doi.org/10.5555/fixture',is_oa:false,license:'publisher-only'},
    {landing_page_url:'https://repository.example/item/1',pdf_url:'https://repository.example/item/1.pdf',is_oa:true,license:null,version:'submittedVersion'}]};
const budget={rate_limit:{daily_budget_usd:1,daily_remaining_usd:.9,prepaid_balance_usd:0,prepaid_remaining_usd:0,endpoint_costs_usd:{search:.001}}};
const feed=`<feed xmlns="http://www.w3.org/2005/Atom" xmlns:ax="http://arxiv.org/schemas/atom" xmlns:o="http://a9.com/-/spec/opensearch/1.1/">
  <o:totalResults>2</o:totalResults><entry><id>http://arxiv.org/abs/2601.12345v2</id><title>Synthetic Atom fixture</title>
  <published>2026-01-01T00:00:00Z</published><author><name>Fixture Author</name></author>
  <link rel="alternate" type="text/html" href="https://arxiv.org/abs/2601.12345v2"/>
  <link type="application/pdf" href="https://arxiv.org/pdf/2601.12345v2"/>
  <ax:doi>10.5555/published-fixture</ax:doi><summary>Never persist this abstract.</summary></entry></feed>`;
const json=value=>new Response(JSON.stringify(value));

test('paper identities preserve source IDs and arXiv legacy/version identities',()=>{
  for(const [source,id] of [['doaj','a'.repeat(32)],['openalex','W12345'],['arxiv','2601.12345v2'],['arxiv','hep-th/9701001v1']]){
    assert.deepEqual(parseContentKey(contentKey(source,id)),{sourceId:source,recordId:id});
  }
  assert.notEqual(contentKey('arxiv','2601.12345v2'),contentKey('arxiv','2601.12345v3'));
  for(const key of ['fcd:v1:doaj:../escape','fcd:v1:openalex:W0','fcd:v1:arxiv:2601.12345v0'])assert.equal(parseContentKey(key),null);
});
test('DOAJ fulltext links are evidence; abstract links, journal language and missing licence are not inferred',()=>{
  const item=mapDoaj(article,observedAt);
  assert.equal(item.locations.length,1);assert.equal(readingActions(item,{now:now()}).length,1);
  assert.deepEqual(item.languages,['und']);assert.equal(item.locations[0].license,undefined);
  assert.equal(mapDoaj({...article,bibjson:{...article.bibjson,link:[]}},observedAt).locations.length,0);
});
test('DOAJ search escapes literals and constructs numeric paging instead of following next URLs',async()=>{
  const seen=[];const adapter=createDoajAdapter({now,fetchImpl:async url=>{seen.push(new URL(url));return json({total:2,results:[article],next:'http://127.0.0.1/private'});}});
  const first=await adapter.search({query:'title " OR *',limit:1});
  assert.equal(seen[0].origin,'https://doaj.org');assert.match(decodeURIComponent(seen[0].pathname),/\\"/);
  assert.equal(first.nextSourceCursor,'2');await adapter.search({query:'literal',limit:1},{sourceCursor:first.nextSourceCursor});
  assert.equal(seen[1].searchParams.get('page'),'2');
  await assert.rejects(adapter.search({query:'x',limit:1},{sourceCursor:'https://evil.example'}));
});
test('arXiv parses namespaces, keeps versions, and never treats the journal DOI as a free copy',async()=>{
  let requested;
  const adapter=createArxivAdapter({now,fetchImpl:async url=>{requested=new URL(url);return new Response(feed);}});
  const page=await adapter.search({query:'arXiv:2601.12345v2',limit:1});const item=page.items[0];
  assert.equal(requested.origin,'https://export.arxiv.org');assert.equal(requested.searchParams.get('id_list'),'2601.12345v2');
  assert.equal(item.version,'v2');assert.equal(item.kind,'preprint');assert.equal(item.locations[0].license,undefined);
  assert.equal(item.relations[0].targetUrl,'https://doi.org/10.5555/published-fixture');
  assert.equal(item.locations.some(l=>l.landingUrl.includes('doi.org')),false);
  assert.equal(JSON.stringify(item).includes('Never persist'),false);assert.equal(page.nextSourceCursor,null);
  const search=await adapter.search({query:'literature',limit:1});assert.equal(search.nextSourceCursor,'1');
});
test('arXiv rejects DTD/entities, malformed feeds and foreign reading hosts',async()=>{
  for(const xml of ['<!DOCTYPE feed [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+feed,'<feed>','<wrong/>'])assert.throws(()=>parseArxivFeed(xml));
  const adapter=createArxivAdapter({now,fetchImpl:async()=>new Response(feed.replaceAll('arxiv.org/abs','evil.example/abs'))});
  await assert.rejects(adapter.search({query:'x',limit:1}),e=>e.sourceStatus==='unavailable');
});
test('OpenAlex needs individual OA locations, preserves unknown licence and excludes datasets',()=>{
  const item=mapOpenalex(work,observedAt);
  const actions=readingActions(item,{now:now()});assert.equal(actions.length,1);assert.match(actions[0].url,/repository.example/);
  assert.equal(item.locations[1].license,undefined);assert.deepEqual(item.flags,['source_reports_retracted']);
  assert.equal(item.locations[1].version,'submittedVersion');assert.equal(mapOpenalex({...work,type:'dataset'},observedAt),null);
  assert.equal(readingActions(mapOpenalex({...work,locations:[{landing_page_url:'https://repository.example/1'}]},observedAt),{now:now()}).length,0);
  assert.equal(readingActions(mapOpenalex({...work,open_access:{is_oa:false}},observedAt),{now:now()}).length,0);
});
test('OpenAlex verifies free allowance before search and never exposes its key in mapped metadata',async()=>{
  const urls=[];const adapter=createOpenalexAdapter({now,apiKey:'synthetic-secret',fetchImpl:async url=>{urls.push(new URL(url));
    return json(new URL(url).pathname==='/rate-limit'?budget:{results:[work],meta:{next_cursor:'next'}});}});
  const page=await adapter.search({query:'malaria',limit:1});assert.equal(urls[0].pathname,'/rate-limit');
  assert.equal(urls[1].searchParams.get('filter'),'is_oa:true');assert.equal(urls[1].searchParams.get('search'),'malaria');
  assert.equal(page.nextSourceCursor,'next');assert.equal(JSON.stringify(page).includes('synthetic-secret'),false);
});
test('changed prices, paid balance, exhausted free quota and invalid budget prevent OpenAlex dispatch',async()=>{
  for(const change of [{prepaid_balance_usd:1},{prepaid_remaining_usd:1},{daily_budget_usd:2},{daily_remaining_usd:0},{endpoint_costs_usd:{search:.002}}]){
    let calls=0;const adapter=createOpenalexAdapter({apiKey:'synthetic',fetchImpl:async()=>{calls++;return json({rate_limit:{...budget.rate_limit,...change}});}});
    await assert.rejects(adapter.search({query:'x',limit:1}),e=>['unavailable','quota_exhausted'].includes(e.sourceStatus));assert.equal(calls,1);
  }
});
test('adapters distinguish throttles and invalid/oversized responses from empty results',async()=>{
  for(const make of [createDoajAdapter,createArxivAdapter,createOpenalexAdapter]){
    const throttled=make({apiKey:'synthetic',fetchImpl:async()=>new Response('',{status:429,headers:{'retry-after':'23'}})});
    await assert.rejects(throttled.search({query:'x',limit:1}),e=>e.sourceStatus==='throttled'&&e.retryAfterSeconds===23);
    const oversized=make({apiKey:'synthetic',fetchImpl:async()=>new Response('{}',{headers:{'content-length':String(3*1024*1024)}})});
    await assert.rejects(oversized.search({query:'x',limit:1}),e=>e.sourceStatus==='unavailable');
    const invalid=make({apiKey:'synthetic',fetchImpl:async()=>new Response('invalid')});
    await assert.rejects(invalid.search({query:'x',limit:1}),e=>e.sourceStatus==='unavailable');
  }
});
