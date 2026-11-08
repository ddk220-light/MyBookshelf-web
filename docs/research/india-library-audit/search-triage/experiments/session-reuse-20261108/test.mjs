import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {EvidenceStore} from '/workspace/MyBookshelf-web-india-library-audit/server/services/catalog-connectors/evidence.js';
import {Coordinator} from '/workspace/MyBookshelf-web-india-library-audit/server/services/catalog-connectors/transport.js';
import {searchForm,parseCatalogSearch} from '/workspace/MyBookshelf-web-india-library-audit/server/services/providers/egranthalaya.js';
const root='/workspace/MyBookshelf-web-india-library-audit',dir='/workspace/library-audit-review/session-reuse-experiment-20261108',require=createRequire(root+'/package.json');
const {EnvHttpProxyAgent,setGlobalDispatcher}=require('undici');if(process.env.HTTP_PROXY||process.env.HTTPS_PROXY)setGlobalDispatcher(new EnvHttpProxyAgent());
for(const p of ['/workspace/library-audit-review/search-triage-supervisor/writer.lock','/workspace/library-audit-review/link-supervisor/writer.lock'])if(existsSync(p))throw Error('Active supervisor');
const store=new EvidenceStore(dir),machine=new EvidenceStore('/tmp/mybookshelf-library-connector-coordinator'),coordinator=new Coordinator({store,concurrency:1});
for(const p of [root+'/docs/research/india-library-audit/runs/india-20261107/origin-state.json',root+'/docs/research/india-library-audit/revalidation/20261107/origin-state.json',root+'/docs/research/india-library-audit/search-triage/india-20261108/origin-state.json'])if(existsSync(p)){
 const data=JSON.parse(readFileSync(p));for(const k of ['cooldowns','refusals','policyFailures','originReadyAt'])for(const [o,v] of data[k]||[])if(k==='cooldowns'||k==='originReadyAt')coordinator[k].set(o,Math.max(coordinator[k].get(o)||0,v));else coordinator[k].set(o,v);
}
const chosen=JSON.parse(readFileSync('/workspace/library-audit-review/direct-post-experiment-20261108/selection.json'));
const sha=s=>createHash('sha256').update(s).digest('hex');
const decode=s=>s.replace(/&#(x[0-9a-f]+|\d+);|&(amp|quot|apos|lt|gt);/gi,(m,n,a)=>n?String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n)):({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'})[a.toLowerCase()]);
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:$-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].toLowerCase(),decode(m[2]??m[3])]));
const hidden=html=>[...html.matchAll(/<input\b[^>]*>/gi)].map(m=>attrs(m[0])).filter(a=>a.type?.toLowerCase()==='hidden'&&a.name).map(a=>({field:a.name,length:(a.value||'').length,digest:sha(a.value||'')})).sort((a,b)=>a.field.localeCompare(b.field));
const cookie=(r,old='')=>(r.headers.getSetCookie?.()||[r.headers.get('set-cookie')||'']).map(s=>s.match(/(?:^|,\s*)(ASP\.NET_SessionId=[A-Za-z0-9_-]+)(?:;|$)/i)?.[1]).find(Boolean)||old;
const changed=(a,b)=>[...new Set([...a.map(x=>x.field),...b.map(x=>x.field)])].filter(k=>a.find(x=>x.field===k)?.digest!==b.find(x=>x.field===k)?.digest);
function inspect(r,member,query){let records=[],parseError=null;try{records=parseCatalogSearch(r.text,member,Infinity);}catch(e){parseError=e.message;}const fields=searchForm(r.text,{libraryCode:member,query,field:'TITLE'});const input=[...r.text.matchAll(/<input\b[^>]*>/gi)].map(m=>attrs(m[0])).find(a=>a.name==='txt_Search');const count=r.text.match(/Your Search Returned\s+(\d+)\s+Record\(s\)/i)?.[1];return {status:r.status,echoedQuery:input?.value??null,total:count==null?null:Number(count),returned:records.length,records,parseError,recognizedSearch:r.ok&&!parseError&&input?.value===query,hasNativeForm:Boolean(fields)};}
function guard(r){if(!r.ok)throw Error('HTTP '+r.status);if(/<title[^>]*>\s*(?:Just a moment|Access denied|Attention Required)/i.test(r.text)||/cf-chl-/i.test(r.text))throw Error('Access challenge; stop origin');}
let held=false,mheld=false;const results=[];
try{
 machine.acquire();mheld=true;store.acquire();held=true;
 store.append({type:'session_experiment_started',purpose:'Compare hidden-state and session changes; test original-state versus response-state reuse, without details lookups',libraryIds:chosen.map(x=>x.library.libraryId)});
 for(const x of chosen){
  const lib=x.library,route=lib.routes[0],member=route.memberCode,url=new URL('https://eg4.nic.in/OPAC/Default.aspx');url.search=new URLSearchParams({CL_NAME:route.cluster,LIB_CODE:member});
  const ctx=coordinator.context({libraryId:lib.libraryId,allowedOrigins:['https://eg4.nic.in'],timeoutMs:300000});const row={libraryId:lib.libraryId,name:lib.name,cluster:route.cluster,memberCode:member,url:url.toString(),steps:[]};
  const options={maxResponseBytes:4*1024*1024,allowedResponseTypes:['text/html','application/xhtml+xml']};
  async function req(label,{method='GET',session='',html=null,query=null}={}){
   const headers={Accept:'text/html',Referer:url.toString()};if(session)headers.Cookie=session;
   let body;if(method==='POST'){headers['Content-Type']='application/x-www-form-urlencoded';const f=searchForm(html,{libraryCode:member,query,field:'TITLE'});if(!f)throw Error('Source state not recognized');body=f.toString();}
   const r=await ctx.request(url.toString(),{...options,method,headers,body});guard(r);
   const next=cookie(r,session);const step={label,method,query,observedAt:new Date().toISOString(),hidden: hidden(r.text),session:{sent:Boolean(session),returnedIdentifier:Boolean(cookie(r)),effectiveDigest:next?sha(next):null,changedFromSent:session?next!==session:null},evidence:ctx.evidence.at(-1),...(query?inspect(r,member,query):{status:r.status})};
   row.steps.push(step);store.append({type:'session_experiment_step',libraryId:lib.libraryId,...step});return {response:r,session:next,step};
  }
  try{
   const a=await req('A_fresh_GET');if(!a.session)throw Error('Missing initial session');
   const b=await req('B_independent_fresh_GET');if(!b.session)throw Error('Missing independent session');
   const a2=await req('A_repeat_GET',{session:a.session});
   const p1=await req('A_original_state_Wings',{method:'POST',session:a2.session,html:a.response.text,query:'Wings of Fire'});
   const p2=await req('A_reuse_original_state_History',{method:'POST',session:p1.session,html:a.response.text,query:'History'});
   const p3=await req('A_response_state_History',{method:'POST',session:p2.session,html:p2.response.text,query:'History'});
   const p4=await req('A_response_state_Wings',{method:'POST',session:p3.session,html:p3.response.text,query:'Wings of Fire'});
   const key=p=>JSON.stringify(p.step.records.map(r=>[r.recordId,r.title]));
   row.comparisons={independentSessionIdentifiersDiffer:a.session!==b.session,sameSessionIdentifierStable:[a2,p1,p2,p3,p4].every(p=>p.session===a.session),hiddenChangesAcrossFreshSessions:changed(a.step.hidden,b.step.hidden),hiddenChangesRepeatGET:changed(a.step.hidden,a2.step.hidden),hiddenChangesAfterFirstSearch:changed(a.step.hidden,p1.step.hidden),hiddenChangesAfterDifferentQuery:changed(p1.step.hidden,p2.step.hidden),originalStateReuseRecognized:p2.step.recognizedSearch,originalVsResponseStateHistorySameResults:key(p2)===key(p3)&&p2.step.total===p3.step.total,repeatWingsSameResults:key(p1)===key(p4)&&p1.step.total===p4.step.total,allFourSearchesRecognized:[p1,p2,p3,p4].every(p=>p.step.recognizedSearch)};
  }catch(e){row.error={code:e.code||e.name,message:e.message};}
  results.push(row);store.append({type:'session_experiment_library_result',...row});store.save('results.json',{at:new Date().toISOString(),results});console.log(JSON.stringify({library:row.name,comparisons:row.comparisons,searches:row.steps.filter(s=>s.method==='POST').map(s=>({label:s.label,recognized:s.recognizedSearch,returned:s.returned,total:s.total})),error:row.error}));if(row.error)break;
 }
 store.append({type:'session_experiment_complete',tested:results.length});
}finally{if(held){store.save('origin-state.json',Object.fromEntries(['cooldowns','refusals','policyFailures','originReadyAt'].map(k=>[k,[...coordinator[k]]])));store.release();}if(mheld)machine.release();}
