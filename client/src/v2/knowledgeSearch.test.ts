import {describe,it,expect,vi} from 'vitest';
import {knowledgeSources,runKnowledgeSearch,type KnowledgeSource} from './knowledgeSearch';
import type {ContentPage} from './contentTypes';
import {PublicApiError} from './api';
const sources=Array.from({length:5},(_,i)=>({id:String(i),name:String(i),scope:'fixture',kinds:['book'],languages:[],enabled:true,mode:'live'} as KnowledgeSource));
const page:ContentPage={items:[],sources:[],hiddenUnclear:0,nextCursor:null,coverage:'partial',policyRevision:'fixture'};
describe('cross-source search',()=>{
 it('limits concurrent requests and retains successful results when another source fails',async()=>{
  let active=0,max=0;const results:string[]=[];const errors:string[]=[];
  await runKnowledgeSearch(sources,{query:'fixture'},new AbortController().signal,(id,p,e)=>{if(p)results.push(id);if(e)errors.push(id);},async source=>{active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,5));active--;if(source.id==='1')throw new PublicApiError();return page;});
  expect(max).toBe(3);expect(results.sort()).toEqual(['0','2','3','4']);expect(errors).toEqual(['1']);
 });
 it('does not launch more providers or deliver stale results after navigation cancels a search',async()=>{
  const controller=new AbortController();let calls=0,results=0;
  await runKnowledgeSearch(sources,{query:'old'},controller.signal,()=>results++,async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,1));controller.abort();return page;});expect(calls).toBe(3);expect(results).toBe(0);
 });
});

it('filters retired source options from an older directory response',async()=>{const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({sources:[{...sources[0],id:'core'},{...sources[0],id:'librivox'}]}));try{expect((await knowledgeSources(new AbortController().signal)).map(s=>s.id)).toEqual(['librivox']);}finally{fetch.mockRestore();}});
