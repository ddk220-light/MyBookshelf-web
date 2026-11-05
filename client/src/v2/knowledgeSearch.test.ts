import {describe,it,expect} from 'vitest';
import {runKnowledgeSearch,type KnowledgeSource} from './knowledgeSearch';
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
