import {contentKey,normalizeDoi,safeWebUrl} from './contracts.js';
import {clean,sourceError,sourceSignal,sourceJson} from './sourceHttp.js';
const ORIGIN='https://doaj.org';
const quote=value=>'"'+value.replace(/[\\"]/g,'\\$&')+'"';

export function mapDoaj(record,observedAt){
  const b=record?.bibjson;let key;
  try{key=contentKey('doaj',record.id);}catch{return null;}
  if(!clean(b?.title))return null;
  const locations=(Array.isArray(b.link)?b.link:[]).flatMap((link,i)=>{
    const url=safeWebUrl(link.url);if(!url||link.type!=='fulltext'||new URL(url).hostname==='doi.org')return [];
    const pdf=link.content_type==='application/pdf';
    const licence=b.license?.[0];
    return [{id:`doaj:${record.id}:${i}`,host:new URL(url).hostname,landingUrl:url,...!pdf?{readerUrl:url}:{},
      downloads:pdf?[{url,mimeType:'application/pdf'}]:[],access:'free_full_text',
      ...(clean(licence?.type)?{license:{id:clean(licence.type,100),...safeWebUrl(licence.url)?{url:safeWebUrl(licence.url)}:{}}}:{}),
      evidence:{sourceId:'doaj',field:'bibjson.link.type=fulltext; DOAJ open access catalog',observedAt}}];
  });
  return {key,kind:'article',title:clean(b.title),contributors:(Array.isArray(b.author)?b.author:[]).flatMap(a=>clean(a.name)?[{name:clean(a.name,240),role:'author'}]:[]).slice(0,100),
    identifiers:[{scheme:'doaj',value:record.id},...(Array.isArray(b.identifier)?b.identifier:[]).flatMap(i=>i.type==='doi'&&normalizeDoi(i.id)?[{scheme:'doi',value:normalizeDoi(i.id)}]:[])],
    // Journal language is not article language.
    languages:['und'],subjects:(b.keywords||[]).filter(k=>typeof k==='string').slice(0,30).map(k=>clean(k,300)),locations,relations:[],
    ...(clean(b.journal?.title)?{container:{title:clean(b.journal.title)}}:{}),.../^\d{4}$/.test(b.year)?{publishedAt:b.year}:{},
    provenance:[{sourceId:'doaj',sourceRecordId:record.id,recordUrl:`${ORIGIN}/article/${record.id}`,retrievedAt:observedAt,mappingVersion:'doaj-v4-v1'}]};
}

export function createDoajAdapter({fetchImpl=globalThis.fetch,now=()=>Date.now()}={}){
  return {async search(query,{sourceCursor='1',signal,exactRecord}={}){
    if(!/^[1-9]\d{0,3}$/.test(sourceCursor))throw sourceError('unavailable');
    const page=Number(sourceCursor),doi=normalizeDoi(query.query);
    const search=exactRecord?`id:${quote(exactRecord.recordId)}`:doi?`bibjson.identifier.id:${quote(doi)}`:quote(query.query);
    const url=new URL('/api/v4/search/articles/'+encodeURIComponent(search),ORIGIN);
    url.search=new URLSearchParams({page:String(page),pageSize:String(query.limit)}).toString();
    const data=await sourceJson(fetchImpl,url,{signal:sourceSignal(signal)});
    if(!Array.isArray(data.results)||data.results.length>query.limit||!Number.isFinite(data.total))throw sourceError('unavailable');
    const observedAt=new Date(now()).toISOString();
    return {items:data.results.map(r=>mapDoaj(r,observedAt)).filter(Boolean),observedAt,
      nextSourceCursor:data.results.length&&page*query.limit<data.total&&page<1000?String(page+1):null};
  }};
}
