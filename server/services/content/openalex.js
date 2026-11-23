import {contentKey,normalizeDoi,safeWebUrl} from './contracts.js';
import {clean,sourceError,sourceSignal,sourceJson} from './sourceHttp.js';
const ORIGIN='https://api.openalex.org';
const FIELDS='id,title,type,doi,language,publication_date,authorships,locations,best_oa_location,primary_location,is_retracted,open_access';

export function mapOpenalex(record,observedAt){
  const id=/^https:\/\/openalex\.org\/(W[1-9]\d{0,14})$/.exec(record?.id||'')?.[1];
  const kind=({'article':'article','review':'article','editorial':'article','letter':'article','erratum':'article',
    'preprint':'preprint','book-chapter':'chapter','dissertation':'thesis','report':'report'})[record?.type];
  if(!id||!kind||!clean(record.title))return null;
  const seen=new Set();
  const supplied=[record.best_oa_location,...Array.isArray(record.locations)?record.locations:[]].filter(Boolean);
  const locations=supplied.flatMap((entry,i)=>{
    const landing=safeWebUrl(entry.landing_page_url),pdf=safeWebUrl(entry.pdf_url);
    const url=landing||pdf;if(!url||seen.has(url))return [];seen.add(url);
    // Item-wide OA status and DOI metadata never grant a location access.
    const contradictory=record.open_access?.is_oa===false||supplied.some(other=>other.is_oa===false&&safeWebUrl(other.landing_page_url||other.pdf_url)===url);
    const free=entry.is_oa===true&&!contradictory;
    return [{id:`openalex:${id}:${i}`,host:clean(entry.source?.display_name,120)||new URL(url).hostname,
      landingUrl:url,...landing?{readerUrl:landing}:{},version:clean(entry.version,100)||undefined,
      downloads:pdf?[{url:pdf,mimeType:'application/pdf'}]:[],access:free?'free_full_text':entry.is_oa===false?'restricted':'unknown',
      ...clean(entry.license)?{license:{id:clean(entry.license,100)}}:{},
      evidence:{sourceId:'openalex',field:'locations[].is_oa + supplied landing_page_url/pdf_url',observedAt}}];
  });
  const doi=normalizeDoi(record.doi);
  return {key:contentKey('openalex',id),kind,title:clean(record.title),
    contributors:(Array.isArray(record.authorships)?record.authorships:[]).flatMap(a=>clean(a.author?.display_name)?[{name:clean(a.author.display_name,240),role:'author'}]:[]).slice(0,100),
    identifiers:[{scheme:'openalex',value:id},...doi?[{scheme:'doi',value:doi}]:[]],
    languages:/^[a-z]{2,3}$/.test(record.language||'')?[record.language]:['und'],subjects:[],relations:[],locations,
    ...(clean(record.publication_date)?{publishedAt:clean(record.publication_date,30)}:{}),
    ...(clean(record.primary_location?.source?.display_name)?{container:{title:clean(record.primary_location.source.display_name)}}:{}),
    ...(record.is_retracted===true?{flags:['source_reports_retracted']}:{}),
    provenance:[{sourceId:'openalex',sourceRecordId:id,recordUrl:record.id,retrievedAt:observedAt,mappingVersion:'openalex-location-v1'}]};
}

export function createOpenalexAdapter({fetchImpl=globalThis.fetch,now=()=>Date.now(),apiKey=process.env.OPENALEX_API_KEY}={}){
  return {async search(query,{sourceCursor='*',signal,exactRecord}={}){
    if(!apiKey||typeof sourceCursor!=='string'||sourceCursor.length>1500)throw sourceError('unavailable');
    const deadline=sourceSignal(signal);
    const budgetUrl=new URL('/rate-limit',ORIGIN);budgetUrl.searchParams.set('api_key',apiKey);
    const budget=await sourceJson(fetchImpl,budgetUrl,{signal:deadline,maxBytes:32768});
    const rate=budget?.rate_limit,cost=rate?.endpoint_costs_usd?.search;
    // Fail closed if policy changes or prepaid money could be consumed. The
    // adapter only uses ordinary search/singleton endpoints, never paid content.
    if(!Number.isFinite(rate?.daily_budget_usd)||rate.daily_budget_usd<=0||rate.daily_budget_usd>1
      ||rate.prepaid_balance_usd!==0||rate.prepaid_remaining_usd!==0||cost!==0.001)throw sourceError('unavailable');
    if(!Number.isFinite(rate.daily_remaining_usd)||rate.daily_remaining_usd<cost)throw sourceError('quota_exhausted');
    const url=new URL(exactRecord?'/works/'+exactRecord.recordId:'/works',ORIGIN);
    url.searchParams.set('api_key',apiKey);
    if(!exactRecord){
      const doi=normalizeDoi(query.query);
      url.searchParams.set('filter',doi?'doi:https://doi.org/'+doi+',is_oa:true':'is_oa:true');
      if(!doi)url.searchParams.set('search',query.query);
      url.searchParams.set('per-page',String(query.limit));url.searchParams.set('cursor',sourceCursor);url.searchParams.set('select',FIELDS);
    }
    const data=await sourceJson(fetchImpl,url,{signal:deadline});
    const records=exactRecord?[data]:data.results;
    if(!Array.isArray(records)||records.length>query.limit)throw sourceError('unavailable');
    const observedAt=new Date(now()).toISOString();
    return {items:records.map(r=>mapOpenalex(r,observedAt)).filter(Boolean),observedAt,
      nextSourceCursor:!exactRecord&&records.length&&typeof data.meta?.next_cursor==='string'&&data.meta.next_cursor!==sourceCursor&&data.meta.next_cursor.length<=1500?data.meta.next_cursor:null};
  }};
}
