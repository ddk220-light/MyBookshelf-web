import assert from 'node:assert/strict';
import test from 'node:test';
import {createContentService} from './search.js';
const now=Date.parse('2026-11-01T09:00:00Z');
const env={CONTENT_DISCOVERY_ENABLED:'true',CONTENT_CURSOR_SECRET:'synthetic-federation-secret-with-32-characters'};
for(const source of ['EUROPEPMC','DOAJ','ARXIV','OPENALEX'])Object.assign(env,{['CONTENT_'+source+'_ENABLED']:'true',
  ['CONTENT_'+source+'_DAILY_LIMIT']:'10',['CONTENT_'+source+'_PER_MINUTE']:'5'});
function item(source,id){return {key:`fcd:v1:${source}:${id}`,kind:'article',title:'Synthetic source fixture '+id,languages:['en'],
  contributors:[],provenance:[{sourceId:source}],locations:[{id:'oa',host:'Fixture host',landingUrl:'https://publisher.example/'+id,
    access:'free_full_text',evidence:{sourceId:source,field:'Fixture explicit OA location',observedAt:new Date(now).toISOString()}}]};}
// Test-only state adapter; actual Lua/spacing tests use real Redis separately.
function shared(){const pages=new Map();return {shared:true,get:async(s,k)=>pages.get(s+k),run:async(s,k,p,work)=>{
  if(pages.has(s+k))return {status:'ok',cached:true,page:structuredClone(pages.get(s+k))};
  const page=await work();pages.set(s+k,structuredClone(page));return {status:'ok',page};}};}
const query={query:'malaria',kinds:['article'],limit:2};
test('three source buffers page all records without skips, repeated requests or leaked source cursors',async()=>{
  const calls=[];const adapters=Object.fromEntries(['europepmc','doaj','arxiv','openalex'].map(source=>[source,{search:async(_q,options)=>{
    calls.push([source,options.sourceCursor]);return {items:[item(source,source+'1'),item(source,source+'2')],nextSourceCursor:null};}}]));
  const coordinator=shared();const make=()=>createContentService({env,adapters,coordinatorFactory:()=>coordinator,now:()=>now});
  const pages=[];let cursor;
  do{const page=await make().search({...query,...cursor?{cursor}:{}});pages.push(page);if(cursor)assert.deepEqual(await make().search({...query,cursor}),page);cursor=page.nextCursor;}while(cursor);
  assert.equal(pages.length,3);const keys=pages.flatMap(p=>p.items.map(i=>i.key));assert.equal(new Set(keys).size,6);
  assert.equal(calls.length,3);assert.equal(calls.some(([source])=>source==='arxiv'),false);
  assert.equal(pages[0].sources.find(s=>s.id==='arxiv').status,'not_selected');
  assert.equal(JSON.stringify(pages).includes('nextState'),false);
  assert.equal(pages[0].nextCursor.includes('sourceCursor'),false);
});
test('a failed source preserves other results and retries only that source in the existing session',async()=>{
  let doajCalls=0,europeCalls=0;
  const adapters={europepmc:{search:async()=>{europeCalls++;return {items:[item('europepmc','1')],nextSourceCursor:null};}},
    doaj:{search:async()=>{doajCalls++;if(doajCalls===1)throw Object.assign(Error('timeout'),{sourceStatus:'timeout'});return {items:[item('doaj','2')],nextSourceCursor:null};}}};
  const coordinator=shared();const service=createContentService({env,adapters,coordinatorFactory:()=>coordinator,now:()=>now});
  const input={...query,sourceIds:['europepmc','doaj']};const first=await service.search(input);
  assert.equal(first.items.length,1);assert.equal(first.sources.find(s=>s.id==='doaj').status,'timeout');
  const second=await service.search({...input,cursor:first.sessionCursor,retrySource:'doaj'});
  assert.equal(second.items[0].key,'fcd:v1:doaj:2');assert.equal(doajCalls,2);assert.equal(europeCalls,1);
  assert.deepEqual(await service.search({...input,cursor:first.sessionCursor,retrySource:'doaj'}),second);
  assert.equal(doajCalls,2);
});
test('source limits remain explicit while specialist pages answer; failed pages do not become cached empty matches',async()=>{
  let calls=0;
  const adapters={europepmc:{search:async()=>({items:[item('europepmc','1')],nextSourceCursor:null})},
    openalex:{search:async()=>{calls++;throw Object.assign(Error('limit'),{sourceStatus:'quota_exhausted'});}}};
  const service=createContentService({env,adapters,coordinatorFactory:()=>shared(),now:()=>now});
  const page=await service.search({...query,sourceIds:['europepmc','openalex']});
  assert.equal(page.items.length,1);assert.equal(page.sources.find(s=>s.id==='openalex').status,'quota_exhausted');
  for(let i=0;i<2;i++)await assert.rejects(service.search({...query,sourceIds:['openalex']}),e=>e.status===503&&e.sources.find(s=>s.id==='openalex').status==='quota_exhausted');
  assert.equal(calls,3);
});
test('cursor binds selected sources and context; native source URLs are never accepted as browser cursors',async()=>{
  const service=createContentService({env,adapters:{europepmc:{search:async()=>({items:[item('europepmc','1')],nextSourceCursor:'private-native-cursor'})}},coordinatorFactory:()=>shared(),now:()=>now});
  const input={...query,sourceIds:['europepmc']};const first=await service.search(input);
  for(const patch of [{sourceIds:['doaj']},{country:'IN'},{includeUnclear:true},{cursor:'https://evil.example'}])await assert.rejects(service.search({...input,cursor:first.nextCursor,...patch}),e=>e.status===409);
  await assert.rejects(service.search({...input,cursor:first.sessionCursor,retrySource:'arxiv'}),e=>e.status===400);
});

test('a just-found version resolves from the shared record cache without another paced arXiv request',async()=>{
  const coordinator=shared(),records=new Map(),get=coordinator.get;
  coordinator.cache=async(source,entries)=>{for(const entry of entries)records.set(source+entry.key,entry.value);};
  coordinator.get=async(source,key)=>records.get(source+key)||get(source,key);
  let calls=0;
  const paper={...item('arxiv','2601.12345v2'),kind:'preprint'};
  const service=createContentService({env,coordinatorFactory:()=>coordinator,now:()=>now,adapters:{arxiv:{search:async()=>{
    calls++;if(calls>1)throw Object.assign(Error('paced'),{sourceStatus:'queued'});return {items:[paper],nextSourceCursor:null};}}}});
  const page=await service.search({query:'arXiv:2601.12345v2',kinds:['preprint']});
  assert.equal(page.items.length,1);
  assert.equal((await service.resolve({key:paper.key})).item.key,paper.key);
  assert.equal(calls,1);
});

test('exact PMCID, legacy arXiv IDs and DOI searches choose sources that support those identifiers',async()=>{
  for(const [text,expected] of [['PMC13712077',['europepmc']],['q-bio/0611053v1',['arxiv']],['10.5555/fixture',['openalex','europepmc','doaj']]]){
    const calls=[];
    const adapters=Object.fromEntries(['europepmc','doaj','arxiv','openalex'].map(id=>[id,{search:async()=>{calls.push(id);return {items:[],nextSourceCursor:null};}}]));
    const service=createContentService({env,adapters,coordinatorFactory:()=>shared(),now:()=>now});
    await service.search({...query,query:text});assert.deepEqual(calls.sort(),expected.sort());
  }
});
