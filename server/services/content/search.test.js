import assert from 'node:assert/strict';
import test from 'node:test';
import { createContentService } from './search.js';
const now=Date.parse('2026-11-01T08:00:00Z');
const env={CONTENT_DISCOVERY_ENABLED:'true',CONTENT_EUROPEPMC_ENABLED:'true',CONTENT_EUROPEPMC_DAILY_LIMIT:'10',
  CONTENT_EUROPEPMC_PER_MINUTE:'5',CONTENT_CURSOR_SECRET:'synthetic-paper-secret-with-at-least-32-characters'};
const query={query:'malaria',kinds:['article'],limit:2};
const item=id=>({key:`fcd:v1:europepmc:MED:${id}`,kind:'article',title:'Synthetic paper fixture',
  contributors:[],locations:[{id:'oa',host:'Europe PMC',landingUrl:`https://europepmc.org/articles/PMC${id}`,access:'free_full_text',
    evidence:{sourceId:'europepmc',field:'OA location',observedAt:new Date(now).toISOString()},downloads:[]}]});
// Test-only shared fake. Actual atomic Redis behavior is separately exercised by
// coordinator.integration.test.js; this fake does not claim production safety.
function shared(){const pages=new Map();return{shared:true,get:async(_,k)=>pages.get(k),run:async(_,k,p,work)=>{
  if(pages.has(k))return {status:'ok',page:pages.get(k)};
  const page=await work();pages.set(k,page);return{status:'ok',page};}};}

test('two service instances replay shared pages without repeating provider requests',async()=>{
  const coordinator=shared();let calls=0;
  const paperAdapter={search:async(_,options)=>{calls++;return{items:[item(options.sourceCursor==='*'?1:2)],
    nextSourceCursor:options.sourceCursor==='*'?'next':null,observedAt:new Date(now).toISOString()};}};
  const make=()=>createContentService({env,paperAdapter,coordinatorFactory:()=>coordinator,now:()=>now});
  const first=await make().search(query);
  const next=await make().search({...query,cursor:first.nextCursor});
  assert.deepEqual(await make().search({...query,cursor:first.nextCursor}),next);
  assert.equal(calls,2);
  assert.notEqual(first.items[0].key,next.items[0].key);
  assert.equal(next.nextCursor,null);
  assert.equal(first.sources[0].scope,'Biomedical literature');
  await assert.rejects(make().search({...query,country:'IN',cursor:first.nextCursor}),e=>e.status===409);
});

test('missing, failed or non-shared coordinator prevents all live dispatch',async()=>{
  let calls=0;const paperAdapter={search:async()=>{calls++;return {items:[]};}};
  for(const coordinator of [null,{shared:false},{shared:true,run:async()=>{throw Error('offline');}}]){
    const service=createContentService({env,paperAdapter,coordinatorFactory:()=>coordinator});
    await assert.rejects(service.search(query),e=>e.code==='CONTENT_UNAVAILABLE');
  }
  assert.equal(calls,0);
});

test('quota, queued and source outages remain explicit instead of zero matches',async()=>{
  for(const status of ['quota_exhausted','queued','throttled','timeout']){
    const service=createContentService({env,coordinatorFactory:()=>({shared:true,run:async()=>({status})})});
    await assert.rejects(service.search(query),e=>e.sources[0].status===status&&e.status===503);
  }
});

test('unsupported filters do not silently claim filtered source results',async()=>{
  const service=createContentService({env,coordinatorFactory:()=>shared()});
  await assert.rejects(service.search({...query,languages:['ta']}),e=>e.code==='CONTENT_FILTER_UNSUPPORTED');
});

test('provider page overlap is deduplicated and cursor cycles stop instead of looping',async()=>{
  const coordinator=shared();let calls=0;
  const paperAdapter={search:async(_,options)=>{calls++;return{items:options.sourceCursor==='*'?[item(1)]:[item(1),item(2)],
    nextSourceCursor:options.sourceCursor==='*'?'next':'*',observedAt:new Date(now).toISOString()};}};
  const service=createContentService({env,paperAdapter,coordinatorFactory:()=>coordinator,now:()=>now});
  const first=await service.search(query);
  const second=await service.search({...query,cursor:first.nextCursor});
  assert.deepEqual(second.items.map(i=>i.key),['fcd:v1:europepmc:MED:2']);
  assert.equal(second.nextCursor,null);
  assert.equal(second.sources[0].truncated,true);
  assert.equal(calls,2);
});
