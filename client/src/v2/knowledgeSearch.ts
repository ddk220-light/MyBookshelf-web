import {contentApi} from './contentApi';
import {PublicApiError} from './api';
import type {ContentKind,ContentPage} from './contentTypes';
export type KnowledgeSource={id:string;name:string;scope:string;kinds:ContentKind[];languages:string[];enabled:boolean;mode:'live'|'snapshot';reason?:string};
export async function knowledgeSources(signal:AbortSignal):Promise<KnowledgeSource[]>{
  const response=await fetch('/api/v2/content/sources',{signal,credentials:import.meta.env.VITE_DEPLOYMENT_ENV==='preview'?'same-origin':'omit'});
  if(!response.ok)throw new PublicApiError({message:'The source list could not be loaded. Please try again.'});
  const data=await response.json();if(!Array.isArray(data.sources))throw new PublicApiError();return data.sources;
}
export type KnowledgeFilters={query:string;kind?:ContentKind;language?:string;includeUnclear?:boolean};
export function searchKnowledgeSource(source:KnowledgeSource,filters:KnowledgeFilters,signal:AbortSignal,cursor?:string):Promise<ContentPage>{
  return contentApi.search(filters.query,filters.kind?[filters.kind]:source.kinds,{sourceIds:[source.id],includeUnclear:filters.includeUnclear===true,limit:6,...filters.language?{languages:[filters.language]}:{},...cursor?{cursor}:{}},signal);
}
// Bounded fan-out in the browser; each API call has one provider and its own
// signed continuation. Failures cannot discard another source's results.
export async function runKnowledgeSearch(sources:KnowledgeSource[],filters:KnowledgeFilters,signal:AbortSignal,onResult:(id:string,page?:ContentPage,error?:PublicApiError)=>void,search=searchKnowledgeSource){
  let cursor=0;
  async function worker(){while(!signal.aborted){const source=sources[cursor++];if(!source)return;
    try{const page=await search(source,filters,signal);if(!signal.aborted)onResult(source.id,page);}
    catch(error){if(!signal.aborted)onResult(source.id,undefined,error instanceof PublicApiError?error:new PublicApiError({message:'This source could not answer. Other results are still available.'}));}
  }}
  await Promise.all(Array.from({length:Math.min(3,sources.length)},worker));
}
