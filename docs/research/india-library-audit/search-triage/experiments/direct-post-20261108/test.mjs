import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { EvidenceStore } from '/workspace/MyBookshelf-web-india-library-audit/server/services/catalog-connectors/evidence.js';
import { Coordinator } from '/workspace/MyBookshelf-web-india-library-audit/server/services/catalog-connectors/transport.js';
import { searchForm, parseCatalogSearch } from '/workspace/MyBookshelf-web-india-library-audit/server/services/providers/egranthalaya.js';
const root='/workspace/MyBookshelf-web-india-library-audit';
const dir='/workspace/library-audit-review/direct-post-experiment-20261108';
const require=createRequire(root+'/package.json');
const {EnvHttpProxyAgent,setGlobalDispatcher}=require('undici');
if(process.env.HTTP_PROXY||process.env.HTTPS_PROXY)setGlobalDispatcher(new EnvHttpProxyAgent());
for(const p of ['/workspace/library-audit-review/search-triage-supervisor/writer.lock','/workspace/library-audit-review/link-supervisor/writer.lock'])if(existsSync(p))throw Error('Supervisor active');
const machine=new EvidenceStore('/tmp/mybookshelf-library-connector-coordinator'),store=new EvidenceStore(dir);
const coordinator=new Coordinator({store,concurrency:1});
const triage=root+'/docs/research/india-library-audit/search-triage/india-20261108';
for(const p of [root+'/docs/research/india-library-audit/runs/india-20261107/origin-state.json',root+'/docs/research/india-library-audit/revalidation/20261107/origin-state.json',triage+'/origin-state.json'])if(existsSync(p)){
 const s=JSON.parse(readFileSync(p));for(const k of ['cooldowns','refusals','policyFailures','originReadyAt'])for(const [o,v] of s[k]||[]){if(k==='cooldowns'||k==='originReadyAt')coordinator[k].set(o,Math.max(coordinator[k].get(o)||0,v));else coordinator[k].set(o,v);}
}
const selected=JSON.parse(readFileSync(dir+'/selection.json')),results=[];
const clean=s=>s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const attrs=t=>Object.fromEntries([...t.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].toLowerCase(),m[2]??m[3]]));
function describe(r,member,query){
 let records=[],error=null;try{records=parseCatalogSearch(r.text,member,Infinity);}catch(e){error=e.message;}
 const inp=[...r.text.matchAll(/<input\b[^>]*>/gi)].map(m=>attrs(m[0])).find(a=>a.name==='txt_Search');
 const headline=r.text.match(/<span\b[^>]*id=["']Label37["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
 const selectedControls={};for(const m of r.text.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)){const a=attrs(m[1]);const opts=[...m[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)];const o=opts.find(x=>/\bselected\b/i.test(x[1]))||opts[0];if(o)selectedControls[a.name]=attrs(o[1]).value;}
 return {httpStatus:r.status,redirect:r.headers.get('location'),pageTitle:clean(r.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||''),headline:headline?clean(headline):null,echoedQuery:inp?.value??null,selectedControls,parseError:error,returned:records.length,records,searchProved:r.ok&&!error&&records.length>0&&inp?.value===query&&selectedControls.DDL_Field==='TITLE'&&selectedControls.DDL_Materials==='Books'&&records.some(x=>/wings\s+of\s+fire/i.test(x.title)),stateErrorText:/validation of viewstate|invalid postback|event validation|state information is invalid/i.test(r.text)};
}
function guard(r){if(/<title[^>]*>\s*(?:Just a moment|Access denied|Attention Required)/i.test(r.text)||/cf-chl-|g-recaptcha-response[^>]*required/i.test(r.text))throw Error('Genuine access challenge; stop origin');}
let held=false,mheld=false;
try{
 machine.acquire();mheld=true;store.acquire();held=true;
 store.append({type:'experiment_started',purpose:'Owner-requested five-library direct POST without initial GET/cookie/hidden form state',libraryIds:selected.map(x=>x.library.libraryId),noAuditClassificationChanges:true});
 for(const x of selected){
  const route=x.library.routes[0],query=x.baseline.query;
  const url=new URL('https://eg4.nic.in/OPAC/Default.aspx');url.search=new URLSearchParams({CL_NAME:route.cluster,LIB_CODE:route.memberCode});
  const ctx=coordinator.context({libraryId:x.library.libraryId,allowedOrigins:['https://eg4.nic.in'],timeoutMs:180000});
  const fields=new URLSearchParams({DDL_Materials:'Books',txt_Search:query,DDL_Field:'TITLE',DDL_Boolean:'LIKE',DDL_OrderBy:'TITLE',DDL_SortBy:'ASC',DDL_Pages:'20',DDL_Library:route.memberCode,Basic_Search_Bttn:'Search'});
  const options={maxResponseBytes:4*1024*1024,allowedResponseTypes:['text/html','application/xhtml+xml'],headers:{Accept:'text/html','Content-Type':'application/x-www-form-urlencoded',Referer:url.toString()}};
  const row={libraryId:x.library.libraryId,name:x.library.name,cluster:route.cluster,memberCode:route.memberCode,query,url:url.toString(),baseline:{eventId:x.baseline.eventId,observedAt:x.baseline.at,returned:x.baseline.returned,total:x.baseline.total,records:x.baseline.records.map(({recordId,title})=>({recordId,title})),evidence:x.baseline.evidence}};
  try{
   const direct=await ctx.request(url.toString(),{...options,method:'POST',body:fields.toString()});guard(direct);row.direct={...describe(direct,route.memberCode,query),evidence:ctx.evidence.at(-1),cookieSent:false,hiddenStateSent:false,initialFormFetch:false};
   store.append({type:'direct_post_observed',...row});
   // Positive control independently starts a fresh normal session. No details lookup.
   const home=await ctx.request(url.toString(),{...options,method:'GET'});guard(home);
   const cookie=(home.headers.getSetCookie?.()||[home.headers.get('set-cookie')||'']).map(s=>s.match(/(?:^|,\s*)(ASP\.NET_SessionId=[A-Za-z0-9_-]+)(?:;|$)/i)?.[1]).find(Boolean);
   const normalFields=searchForm(home.text,{libraryCode:route.memberCode,query,field:'TITLE'});
   if(!cookie||!normalFields)throw Error('Normal control bootstrap failed');
   const normal=await ctx.request(url.toString(),{...options,method:'POST',body:normalFields.toString(),headers:{...options.headers,Cookie:cookie}});guard(normal);
   row.normal={...describe(normal,route.memberCode,query),evidence:ctx.evidence.at(-1),cookieSent:true,hiddenStateSent:true,initialFormFetch:true};
   row.sameOrderedRecords=JSON.stringify(row.direct.records.map(r=>[r.recordId,r.title]))===JSON.stringify(row.normal.records.map(r=>[r.recordId,r.title]));
  }catch(e){row.error={code:e.code||e.name,message:e.message};}
  results.push(row);store.append({type:'experiment_library_result',...row});store.save('results.json',{at:new Date().toISOString(),results});
  console.log(JSON.stringify({library:row.name,direct:row.direct&&{status:row.direct.httpStatus,returned:row.direct.returned,proved:row.direct.searchProved,error:row.direct.parseError,headline:row.direct.headline},normal:row.normal&&{status:row.normal.httpStatus,returned:row.normal.returned,proved:row.normal.searchProved},error:row.error}));
  if(row.error)break;
 }
 store.append({type:'experiment_complete',tested:results.length,directPasses:results.filter(r=>r.direct?.searchProved).length,normalPasses:results.filter(r=>r.normal?.searchProved).length});
}finally{
 if(held){store.save('origin-state.json',Object.fromEntries(['cooldowns','refusals','policyFailures','originReadyAt'].map(k=>[k,[...coordinator[k]]])));store.release();}if(mheld)machine.release();
}
