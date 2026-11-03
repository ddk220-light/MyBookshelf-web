import assert from 'node:assert/strict';
import test from 'node:test';
import {createContentService} from './search.js';
const env={CONTENT_DISCOVERY_ENABLED:'true',CONTENT_EUROPEPMC_ENABLED:'true',CONTENT_OPENALEX_ENABLED:'true',
  CONTENT_ARXIV_ENABLED:'true',CONTENT_DOAJ_ENABLED:'true',CONTENT_CURSOR_SECRET:'synthetic-live-source-choice-secret-32-chars'};
const input={query:'Mathematics',kinds:['article'],limit:20};

test('one live source is selected by coverage or explicit choice, with no fan-out',async()=>{
  const calls=[];const adapters=Object.fromEntries(['europepmc','openalex'].map(id=>[id,{search:async()=>{calls.push(id);return {items:[]};}}]));
  const service=createContentService({env,adapters});
  for(const [patch,id] of [[{},'openalex'],[{query:'malaria'},'europepmc'],[{query:'PMC123'},'europepmc'],
    [{query:'10.5555/synthetic'},'openalex'],[{sourceIds:['europepmc']},'europepmc']]){
    const page=await service.search({...input,...patch});assert.equal(calls.at(-1),id);
    assert.equal(page.sources.find(s=>s.id===id).status,'ok');
    assert.equal(page.sources.find(s=>s.id===(id==='europepmc'?'openalex':'europepmc')).status,'not_selected');
  }
  assert.equal(calls.length,5);
  await assert.rejects(service.search({...input,sourceIds:['europepmc','openalex']}),e=>e.code==='CONTENT_FILTER_UNSUPPORTED');
  assert.equal(calls.length,5);
});

test('strict aggregate-paced connectors stay external even if old enable flags remain set',async()=>{
  let calls=0;const adapter={search:async()=>{calls++;return {items:[]};}};
  const service=createContentService({env,adapters:{arxiv:adapter,doaj:adapter}});
  for(const patch of [{query:'arXiv:2601.12345v2'},{query:'hep-th/9701001v1'},{sourceIds:['arxiv']},{sourceIds:['doaj']}]){
    await assert.rejects(service.search({...input,...patch}),e=>{
      assert.equal(e.code,'CONTENT_DISABLED');
      for(const id of ['arxiv','doaj']){const row=e.sources.find(s=>s.id===id);assert.equal(row.status,'disabled');assert.equal(new URL(row.searchUrl).protocol,'https:');}
      return true;
    });
  }
  await assert.rejects(service.resolve({key:'fcd:v1:arxiv:2601.12345v2'}),e=>e.code==='CONTENT_DISABLED');
  assert.equal(calls,0);
});

test('missing flags/signing configuration and unsupported language filters do not dispatch',async()=>{
  let calls=0;const adapters={europepmc:{search:async()=>{calls++;return {items:[]};}}};
  await assert.rejects(createContentService({env:{...env,CONTENT_DISCOVERY_ENABLED:'false'},adapters}).search(input),e=>e.code==='CONTENT_DISABLED');
  await assert.rejects(createContentService({env:{...env,CONTENT_CURSOR_SECRET:''},adapters}).search(input),e=>e.code==='CONTENT_UNAVAILABLE');
  await assert.rejects(createContentService({env,adapters}).search({...input,sourceIds:['europepmc'],languages:['ta']}),e=>e.code==='CONTENT_FILTER_UNSUPPORTED');
  await assert.rejects(createContentService({env:{...env,CONTENT_EUROPEPMC_ENABLED:'false',CONTENT_OPENALEX_ENABLED:'false'},adapters}).search(input),e=>e.code==='CONTENT_DISABLED');
  assert.equal(calls,0);
});

test('provider URLs are fixed website links and a source retry cannot change a signed selection',async()=>{
  const service=createContentService({env,adapters:{openalex:{search:async()=>({items:[],nextSourceCursor:'next'})}}});
  const page=await service.search({...input,query:'literal & /? Unicode தமிழ்'});
  const arxiv=page.sources.find(s=>s.id==='arxiv');assert.equal(new URL(arxiv.searchUrl).origin,'https://arxiv.org');
  assert.equal(new URL(arxiv.searchUrl).searchParams.get('query'),'literal & /? Unicode தமிழ்');
  await assert.rejects(service.search({...input,query:'literal & /? Unicode தமிழ்',cursor:page.sessionCursor,retrySource:'europepmc'}),e=>e.status===400);
});
