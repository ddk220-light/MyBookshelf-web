import test from 'node:test';
import assert from 'node:assert/strict';
import {createContentService} from './search.js';
import {createKnowledgeService} from './knowledgeSearch.js';
import {retiredContentSources} from '../../../shared/content-source-availability.mjs';
const env={CONTENT_DISCOVERY_ENABLED:'true',CONTENT_KNOWLEDGE_ENABLED:'true',CONTENT_EUROPEPMC_ENABLED:'true',CONTENT_OPENALEX_ENABLED:'true',CONTENT_CHILDREN_ENABLED:'true',CONTENT_CURSOR_SECRET:'synthetic-retirement-secret-more-than-32-characters'};
test('production directory contains 31 enabled sources and omits all eight retired connectors even with old flags on',()=>{
 const list=createContentService({env}).sources().sources;
 assert.equal(list.filter(s=>s.enabled).length,31);
 for(const id of Object.keys(retiredContentSources))assert.equal(list.some(s=>s.id===id),false,id);
 for(const id of ['metmuseum','librivox','project-madurai','open-book-publishers','europepmc','openalex'])assert.ok(list.find(s=>s.id===id)?.enabled,id);
});
test('public search rejects retired explicit, legacy implicit and pilot queries before any adapter or cache dispatch',async()=>{
 let calls=0;const unexpected=()=>{calls++;throw Error('Retired source dispatched');};
 const api=createContentService({env,local:{search:unexpected,locate:unexpected},knowledge:{search:unexpected},children:{search:unexpected}});
 for(const id of Object.keys(retiredContentSources))for(const extra of [{},{includeUnclear:true},{cursor:'old-cursor'}]){
  await assert.rejects(api.search({query:'the',sourceIds:[id],kinds:[id==='core'?'article':'book'],...extra}),e=>e.code==='CONTENT_DISABLED');
 }
 await assert.rejects(api.search({query:'',collection:'children'}),e=>e.code==='CONTENT_DISABLED');
 await assert.rejects(api.search({query:'the',kinds:['book']}),e=>e.code==='CONTENT_DISABLED');
 assert.deepEqual(api.locate({isbn13:'9780140328721'}).items,[]);assert.throws(()=>api.locate({}),e=>e.code==='CONTENT_INVALID_REQUEST');assert.equal(calls,0);
});
test('knowledge entry point also blocks retired sources while saved record resolution remains available',async()=>{
 let calls=0;const adapters=Object.fromEntries(['core','openstax','mediastudies-press','sugamya-pustakalaya'].map(id=>[id,{search:async()=>{calls++;return {items:[]};}}]));
 const api=createKnowledgeService({env,adapters});
 for(const id of Object.keys(adapters))await assert.rejects(api.search({query:'the',sourceIds:[id],kinds:[id==='core'?'article':'book']}),e=>e.code==='CONTENT_DISABLED');
 assert.equal(calls,0);
 const saved=await createContentService({env}).resolve({key:'fcd:v1:openstax:calculus-volume-1'});assert.equal(saved.item.title,'Calculus Volume 1');
});
