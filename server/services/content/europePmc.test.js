import assert from 'node:assert/strict';
import test from 'node:test';
import { mapEuropePmc, europePmcQuery, createEuropePmcAdapter, EUROPE_PMC_SEARCH } from './europePmc.js';
import { readingActions } from './contracts.js';
const now=Date.parse('2026-11-01T08:00:00Z');
// Synthetic protocol fixture, intentionally not published as a real paper.
const record={id:'123',source:'MED',title:'Synthetic contract record',isOpenAccess:'Y',doi:'10.5555/test',
  fullTextUrlList:{fullTextUrl:[{url:'https://doi.org/10.5555/test',availabilityCode:'S',site:'DOI'},
    {url:'https://europepmc.org/articles/PMC123',availabilityCode:'OA',site:'Europe_PMC',documentStyle:'html'}]}};

test('Europe PMC maps per-location evidence without turning subscription DOI into a free link',()=>{
  const item=mapEuropePmc(record,new Date(now).toISOString());
  assert.equal(item.key,'fcd:v1:europepmc:MED:123');
  assert.equal(readingActions(item,{now})[0].url,'https://europepmc.org/articles/PMC123');
  assert.equal(readingActions(item,{now}).length,1);
  assert.equal(item.locations[1].license,undefined);
  assert.deepEqual(readingActions(mapEuropePmc({...record,isOpenAccess:'N'},new Date(now).toISOString()),{now}),[]);
  assert.deepEqual(readingActions(mapEuropePmc({...record,fullTextUrlList:undefined},new Date(now).toISOString()),{now}),[]);
  assert.equal(mapEuropePmc({...record,source:'PPR'},new Date(now).toISOString()).kind,'preprint');
  assert.equal(mapEuropePmc({...record,source:'MED'},new Date(now).toISOString()).kind,'article');
});

test('literal user text cannot inject raw Europe PMC query grammar',()=>{
  assert.equal(europePmcQuery('https://doi.org/10.5555/TEST'),'DOI:"10.5555/test" AND OPEN_ACCESS:Y');
  assert.equal(europePmcQuery('malaria" OR OPEN_ACCESS:N'),'"malaria\\" OR OPEN_ACCESS:N" AND OPEN_ACCESS:Y');
  assert.equal(europePmcQuery('PMC123'),'EXT_ID:"PMC123" AND SRC:PMC AND OPEN_ACCESS:Y');
});

test('bounded adapter uses fixed origin and reports source-local paging without global totals',async()=>{
  let requested;
  const adapter=createEuropePmcAdapter({now:()=>now,fetchImpl:async(url)=>{requested=new URL(url);return new Response(JSON.stringify({resultList:{result:[record]},nextCursorMark:'next-page'}));}});
  const page=await adapter.search({query:'malaria',limit:5});
  assert.equal(requested.origin+requested.pathname,EUROPE_PMC_SEARCH);
  assert.equal(requested.searchParams.get('cursorMark'),'*');
  assert.equal(page.items.length,1);
  assert.equal(page.nextSourceCursor,'next-page');
  assert.equal(page.total,undefined);
});

test('throttling, malformed, oversized and timed-out responses do not become empty results',async()=>{
  for(const [response,status] of [[new Response('',{status:429,headers:{'retry-after':'30'}}),'throttled'],
    [new Response('invalid'),'unavailable'],[new Response(JSON.stringify({resultList:{}})),'unavailable'],
    [new Response('{}',{headers:{'content-length':'3000000'}}),'unavailable']]) {
    await assert.rejects(createEuropePmcAdapter({fetchImpl:async()=>response}).search({query:'x',limit:5}),e=>e.sourceStatus===status);
  }
  await assert.rejects(createEuropePmcAdapter({fetchImpl:async()=>{throw new DOMException('timeout','TimeoutError');}}).search({query:'x',limit:5}),e=>e.sourceStatus==='timeout');
});
