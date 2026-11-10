import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {EvidenceStore} from '/workspace/MyBookshelf-web-india-library-audit/server/services/catalog-connectors/evidence.js';
import {Coordinator} from '/workspace/MyBookshelf-web-india-library-audit/server/services/catalog-connectors/transport.js';
import {searchForm,parseCatalogSearch} from '/workspace/MyBookshelf-web-india-library-audit/server/services/providers/egranthalaya.js';
const root='/workspace/MyBookshelf-web-india-library-audit',dir='/workspace/library-audit-review/cross-library-session-experiment-20261108',require=createRequire(root+'/package.json');
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
const selected=JSON.parse(readFileSync(dir+'/selection.json'));
const first=selected.withinCluster[0],query='Wings of Fire';
const urlFor=x=>{const r=x.library.routes[0],u=new URL('https://eg4.nic.in/OPAC/Default.aspx');u.search=new URLSearchParams({CL_NAME:r.cluster,LIB_CODE:r.memberCode});return u.toString();};
const options={maxResponseBytes:4*1024*1024,allowedResponseTypes:['text/html','application/xhtml+xml']};
const rows=[];let held=false,mheld=false;
function scope(html){const m=[...html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)].find(m=>attrs(m[1]).name==='DDL_Library');if(!m)return null;const opts=[...m[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)];const o=opts.find(o=>/\bselected\b/i.test(o[1]))||opts[0];return o?attrs(o[1]).value:null;}
const key=records=>JSON.stringify(records.map(r=>[r.recordId,r.title]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
function save(){store.save('results.json',{at:new Date().toISOString(),bootstrapLibrary:first.library.libraryId,query,rows});}
try{
 machine.acquire();mheld=true;store.acquire();held=true;
 store.append({type:'cross_library_experiment_started',purpose:'One bootstrap GET then library-switch POSTs, within and across catalog clusters; no item lookups or audit qualification changes',query});
 const bootctx=coordinator.context({libraryId:first.library.libraryId,allowedOrigins:['https://eg4.nic.in'],timeoutMs:120000});
 const boot=await bootctx.request(urlFor(first),{...options,headers:{Accept:'text/html'}});guard(boot);let session=cookie(boot);if(!session)throw Error('No bootstrap session');
 const originalFields=searchForm(boot.text,{libraryCode:first.library.routes[0].memberCode,query,field:'TITLE'});if(!originalFields)throw Error('Initial native form not recognized');
 store.append({type:'bootstrap_observed',libraryId:first.library.libraryId,evidence:bootctx.evidence.at(-1),hidden:hidden(boot.text),sessionDigest:sha(session)});
 for(const [mode,items] of [['within_cluster',selected.withinCluster],['different_cluster',selected.otherClusters],['return_to_initial',[first]]])for(const x of items){
  const route=x.library.routes[0],ctx=coordinator.context({libraryId:x.library.libraryId,allowedOrigins:['https://eg4.nic.in'],timeoutMs:120000});
  const fields=new URLSearchParams(originalFields);fields.set('DDL_Library',route.memberCode);
  const row={mode,libraryId:x.library.libraryId,name:x.library.name,cluster:route.cluster,requestedMember:route.memberCode,url:urlFor(x),query,initialFormFetchedForThisTarget:false,reusedInitialHiddenState:true,baseline:{eventId:x.baseline.eventId,at:x.baseline.at,records:x.baseline.records.map(({recordId,title})=>({recordId,title})),total:x.baseline.total,evidence:x.baseline.evidence}};
  try{
   const response=await ctx.request(urlFor(x),{...options,method:'POST',body:fields.toString(),headers:{Accept:'text/html',Referer:urlFor(first),'Content-Type':'application/x-www-form-urlencoded',Cookie:session}});guard(response);
   const next=cookie(response,session);row.sessionIdentifierUnchanged=next===session;session=next;
   row.result={...inspect(response,route.memberCode,query),selectedMember:scope(response.text),evidence:ctx.evidence.at(-1)};row.matchesBaseline=key(row.result.records)===key(row.baseline.records)&&row.result.total===row.baseline.total.value;
  }catch(e){row.error={code:e.code||e.name,message:e.message};}
  rows.push(row);store.append({type:'cross_library_result',...row});save();console.log(JSON.stringify({mode,library:row.name,requested:row.requestedMember,selected:row.result?.selectedMember,status:row.result?.status,returned:row.result?.returned,recognized:row.result?.recognizedSearch,baselineMatch:row.matchesBaseline,error:row.error}));if(row.error)throw Error('Stop after genuine HTTP/transport/access error');
 }
 // Independent current positive controls for any unsuccessful library switches.
 for(const row of rows.filter(r=>r.mode==='different_cluster'&&(!r.result?.recognizedSearch||!r.matchesBaseline))){
  const ctx=coordinator.context({libraryId:row.libraryId,allowedOrigins:['https://eg4.nic.in'],timeoutMs:120000});
  const home=await ctx.request(row.url,{...options,headers:{Accept:'text/html'}});guard(home);const c=cookie(home);const fields=searchForm(home.text,{libraryCode:row.requestedMember,query,field:'TITLE'});if(!c||!fields)throw Error('Control form not recognized');
  const response=await ctx.request(row.url,{...options,method:'POST',body:fields.toString(),headers:{Accept:'text/html',Referer:row.url,'Content-Type':'application/x-www-form-urlencoded',Cookie:c}});guard(response);row.freshControl={...inspect(response,row.requestedMember,query),selectedMember:scope(response.text),evidence:ctx.evidence.at(-1)};store.append({type:'fresh_control_result',libraryId:row.libraryId,result:row.freshControl});save();console.log(JSON.stringify({control:row.name,recognized:row.freshControl.recognizedSearch,returned:row.freshControl.returned}));
 }
 store.append({type:'cross_library_experiment_complete',rows:rows.length});
}finally{if(held){store.save('origin-state.json',Object.fromEntries(['cooldowns','refusals','policyFailures','originReadyAt'].map(k=>[k,[...coordinator[k]]])));store.release();}if(mheld)machine.release();}
