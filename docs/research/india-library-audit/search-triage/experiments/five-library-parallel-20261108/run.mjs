import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {EvidenceStore} from '/workspace/MyBookshelf-web-india-library-audit/server/services/catalog-connectors/evidence.js';
import {Coordinator} from '/workspace/MyBookshelf-web-india-library-audit/server/services/catalog-connectors/transport.js';
import {searchForm,parseCatalogSearch} from '/workspace/MyBookshelf-web-india-library-audit/server/services/providers/egranthalaya.js';
const root='/workspace/MyBookshelf-web-india-library-audit',dir='/workspace/library-audit-review/five-library-parallel-spike-20261108',require=createRequire(root+'/package.json');
const {EnvHttpProxyAgent,setGlobalDispatcher}=require('undici');if(process.env.HTTP_PROXY||process.env.HTTPS_PROXY)setGlobalDispatcher(new EnvHttpProxyAgent());
for(const p of ['/workspace/library-audit-review/search-triage-supervisor/writer.lock','/workspace/library-audit-review/link-supervisor/writer.lock'])if(existsSync(p))throw Error('Active supervisor');
const store=new EvidenceStore(dir),machine=new EvidenceStore('/tmp/mybookshelf-library-connector-coordinator'),coordinator=new Coordinator({store,concurrency:1});
for(const p of [root+'/docs/research/india-library-audit/runs/india-20261107/origin-state.json',root+'/docs/research/india-library-audit/revalidation/20261107/origin-state.json',root+'/docs/research/india-library-audit/search-triage/india-20261108/origin-state.json'])if(existsSync(p)){
 const data=JSON.parse(readFileSync(p));for(const k of ['cooldowns','refusals','policyFailures','originReadyAt'])for(const [o,v] of data[k]||[])if(k==='cooldowns'||k==='originReadyAt')coordinator[k].set(o,Math.max(coordinator[k].get(o)||0,v));else coordinator[k].set(o,v);
}
for(const p of ['/workspace/library-audit-review/cluster-throughput-benchmark-20261108/per-library-v3/origin-state.json','/workspace/library-audit-review/cluster-throughput-benchmark-20261108/per-library-v4/origin-state.json'])if(existsSync(p)){const s=JSON.parse(readFileSync(p));for(const k of ['cooldowns','refusals','policyFailures','originReadyAt'])for(const [o,v] of s[k]||[])if(k==='cooldowns'||k==='originReadyAt')coordinator[k].set(o,Math.max(coordinator[k].get(o)||0,v));else coordinator[k].set(o,v);}
const chosen=JSON.parse(readFileSync('/workspace/library-audit-review/direct-post-experiment-20261108/selection.json'));
const sha=s=>createHash('sha256').update(s).digest('hex');
const decode=s=>s.replace(/&#(x[0-9a-f]+|\d+);|&(amp|quot|apos|lt|gt);/gi,(m,n,a)=>n?String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n)):({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'})[a.toLowerCase()]);
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:$-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].toLowerCase(),decode(m[2]??m[3])]));
const hidden=html=>[...html.matchAll(/<input\b[^>]*>/gi)].map(m=>attrs(m[0])).filter(a=>a.type?.toLowerCase()==='hidden'&&a.name).map(a=>({field:a.name,length:(a.value||'').length,digest:sha(a.value||'')})).sort((a,b)=>a.field.localeCompare(b.field));
const cookie=(r,old='')=>(r.headers.getSetCookie?.()||[r.headers.get('set-cookie')||'']).map(s=>s.match(/(?:^|,\s*)(ASP\.NET_SessionId=[A-Za-z0-9_-]+)(?:;|$)/i)?.[1]).find(Boolean)||old;
const changed=(a,b)=>[...new Set([...a.map(x=>x.field),...b.map(x=>x.field)])].filter(k=>a.find(x=>x.field===k)?.digest!==b.find(x=>x.field===k)?.digest);
function inspect(r,member,query){let records=[],parseError=null;try{records=parseCatalogSearch(r.text,member,Infinity);}catch(e){parseError=e.message;}const fields=searchForm(r.text,{libraryCode:member,query,field:'TITLE'});const input=[...r.text.matchAll(/<input\b[^>]*>/gi)].map(m=>attrs(m[0])).find(a=>a.name==='txt_Search');const count=r.text.match(/Your Search Returned\s+(\d+)\s+Record\(s\)/i)?.[1];return {status:r.status,echoedQuery:input?.value??null,total:count==null?null:Number(count),returned:records.length,records,parseError,recognizedSearch:r.ok&&!parseError&&input?.value===query,hasNativeForm:Boolean(fields)};}
function guard(r){if(!r.ok)throw Error('HTTP '+r.status);if(/<title[^>]*>\s*(?:Just a moment|Access denied|Attention Required)/i.test(r.text)||/cf-chl-/i.test(r.text))throw Error('Access challenge; stop origin');}
import {setTimeout as sleep} from 'node:timers/promises';
import {performance} from 'node:perf_hooks';
const manifest=JSON.parse(readFileSync(dir+'/manifest.json')),jobs=manifest.jobs,canaries=jobs.filter(j=>j.libraryId===jobs[0].libraryId).slice(0,10),baseline=new Map(),completed=new Map(),stages=[];
const allStart=Date.now(),cancel=new AbortController();process.once('SIGTERM',()=>cancel.abort());process.once('SIGINT',()=>cancel.abort());
let intervalMs=1000,gateTail=Promise.resolve(),nextStart=0,wireActive=0,wirePeak=0,stageWirePeak=0,rawCalls=0,fatal=null;
async function admission(ctx){const ticket=gateTail.catch(()=>{}).then(async()=>{if(cancel.signal.aborted)throw Error('Benchmark stopped');const wait=Math.max(0,nextStart-Date.now());if(wait)await sleep(wait,undefined,{signal:cancel.signal});nextStart=Date.now()+Math.max(intervalMs,ctx.crawlDelay||0);});gateTail=ticket;await ticket;}
class Lane extends Coordinator{
 constructor(slot){super({store,minGapMs:0,concurrency:1});this.slot=slot;for(const k of ['policies','policyExpires','policyFailures','cooldowns','refusals','originReadyAt'])this[k]=coordinator[k];this.fetch=async(url,options)=>{const ctx=this.current;await admission(ctx);if(options.signal?.aborted)throw Error('Request expired before network admission');ctx.wireAt=Date.now();ctx.networkWasStarted=true;wireActive++;wirePeak=Math.max(wirePeak,wireActive);stageWirePeak=Math.max(stageWirePeak,wireActive);rawCalls++;store.append({type:'benchmark_network_started',libraryId:ctx.libraryId,attemptId:ctx.attemptId,slot,stage:ctx.stage,jobId:ctx.jobId,atNetworkStart:new Date(ctx.wireAt).toISOString(),inFlight:wireActive,method:options.method||'GET'});return fetch(url,options);};}
 async raw(ctx,...args){this.current=ctx;ctx.networkWasStarted=false;try{return await super.raw(ctx,...args);}finally{if(ctx.networkWasStarted){const ms=Date.now()-ctx.wireAt;ctx.lastWireMs=ms;wireActive--;store.append({type:'benchmark_network_finished',libraryId:ctx.libraryId,attemptId:ctx.attemptId,slot:this.slot,stage:ctx.stage,jobId:ctx.jobId,wireMs:ms,inFlightAfter:wireActive});ctx.networkWasStarted=false;}}}
}
const lanes=Array.from({length:250},(_,i)=>new Lane(i)),sessions=[];
const urlFor=j=>{const u=new URL('https://eg4.nic.in/OPAC/Default.aspx');u.search=new URLSearchParams({CL_NAME:j.cluster,LIB_CODE:j.memberCode});return u.toString();};
const options={maxResponseBytes:4*1024*1024,allowedResponseTypes:['text/html','application/xhtml+xml'],timeoutMs:45000};
const quantile=(a,p)=>{a=[...a].sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.ceil(p*a.length)-1)]??null;};
const recordKey=r=>JSON.stringify(r.map(x=>[x.recordId,x.title]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
async function initializeSession(lane,j=jobs[0]){const ctx=lane.context({libraryId:j.libraryId,allowedOrigins:['https://eg4.nic.in'],timeoutMs:120000,signal:cancel.signal});ctx.stage='session_setup';const r=await ctx.request(urlFor(j),{...options,headers:{Accept:'text/html'}});guard(r);const c=cookie(r),fields=searchForm(r.text,{libraryCode:j.memberCode,query:j.query,field:'TITLE'});if(!c||!fields)throw Error('Session bootstrap unrecognized');const s={value:c,fields,initialDigest:sha(c)};store.append({type:'benchmark_session_initialized',slot:lane.slot,evidence:ctx.evidence.at(-1),identifierDigest:s.initialDigest});return s;}
function state(extra={}){store.save('progress.json',{at:new Date().toISOString(),pid:process.pid,phase:'benchmark',elapsedSeconds:(Date.now()-allStart)/1000,totalUnique:250,completedUnique:completed.size,remainingUnique:250-completed.size,wireActive,peakInFlight:wirePeak,rawCalls,stages,...extra});}
const references=JSON.parse(readFileSync(dir+'/baseline.json'));for(const [id,r] of Object.entries(references))baseline.set(id,r.result);
const rows=[],libStarted=new Map(),libCompleted=new Map(),libPeak=new Map(),libActive=new Map();
// Per-member peaks use the same transport events; aggregate requests are measured by Lane.
let held=false,mheld=false,waveStart=null,setupEnd=null;
async function searchOne(j,index){
 const lane=lanes[index],libIndex=manifest.libraries.findIndex(l=>l.libraryId===j.libraryId),session=sessions[libIndex];
 if(!session||session.libraryId!==j.libraryId)throw Error('Library/session binding mismatch');
 const ctx=lane.context({libraryId:j.libraryId,allowedOrigins:['https://eg4.nic.in'],timeoutMs:120000,signal:cancel.signal});ctx.stage='five_library_parallel_wave';ctx.jobId=j.jobId;const start=Date.now();
 if(!libStarted.has(j.libraryId))libStarted.set(j.libraryId,start);libActive.set(j.libraryId,(libActive.get(j.libraryId)||0)+1);libPeak.set(j.libraryId,Math.max(libPeak.get(j.libraryId)||0,libActive.get(j.libraryId)));
 const row={jobId:j.jobId,libraryId:j.libraryId,name:j.name,query:j.query,workId:j.workId,requestedMember:j.memberCode,startedAt:new Date(start).toISOString(),referenceEventId:references[j.jobId].sourceEventId};
 try{
  const fields=new URLSearchParams(session.fields);fields.set('DDL_Library',j.memberCode);fields.set('txt_Search',j.query);
  const r=await ctx.request(urlFor(j),{...options,method:'POST',body:fields.toString(),headers:{Accept:'text/html',Referer:urlFor(j),'Content-Type':'application/x-www-form-urlencoded',Cookie:session.value}});guard(r);
  row.result=inspect(r,j.memberCode,j.query);row.evidence=ctx.evidence.at(-1);row.sessionStable=cookie(r,session.value)===session.value;
  if(!row.result.recognizedSearch||!row.sessionStable)throw Error('Query/library/session contract mismatch');
  const normalize=s=>s.normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]/gu,'');row.titlesRelevant=row.result.records.every(r=>normalize(r.title).includes(normalize(j.query)));if(!row.titlesRelevant)throw Error('Returned title does not match Title query');
  row.sameRecordSet=recordKey(row.result.records)===recordKey(baseline.get(j.jobId).records);row.sameTotal=row.result.total===baseline.get(j.jobId).total;
  if(!row.sameRecordSet||!row.sameTotal)throw Error('Native record set/count differs from reference');
  row.ok=true;completed.set(j.jobId,row);
 }catch(e){row.ok=false;row.error={code:e.code||e.name,message:e.message};if(['SOURCE_ACCESS_BLOCKED','PROVIDER_COOLDOWN','ROBOTS_DISALLOWED','ROBOTS_UNAVAILABLE'].includes(e.code)||/Access challenge/i.test(e.message)){fatal=row.error;cancel.abort();}}
 finally{
  row.finishedAt=new Date().toISOString();row.wallMs=Date.now()-start;row.wireMs=ctx.lastWireMs??null;libActive.set(j.libraryId,libActive.get(j.libraryId)-1);libCompleted.set(j.libraryId,Date.now());rows.push(row);store.append({type:'parallel_search_result',...row});if(rows.length%25===0||!row.ok)state({phase:'parallel_wave',outcomes:rows.length,errors:rows.filter(r=>!r.ok).length});
 }
}
try{
 if(!existsSync('/workspace/library-audit-review/search-triage-supervisor/pause'))throw Error('Main audit pause must remain set');
 machine.acquire();mheld=true;store.acquire();held=true;intervalMs=0;store.append({type:'parallel_spike_started',libraries:5,jobs:250,configuredInFlight:250,artificialStartGapMs:0,mainAuditRemainsPaused:true});
 await Promise.all(manifest.libraries.map(async(lib,i)=>{const j=jobs.find(j=>j.libraryId===lib.libraryId);const s=await initializeSession(lanes[i*50],j);s.libraryId=lib.libraryId;sessions[i]=s;}));
 if(new Set(sessions.map(s=>s.initialDigest)).size!==5)throw Error('Independent session identifiers not established');
 setupEnd=Date.now();waveStart=Date.now();store.append({type:'parallel_wave_started',setupSeconds:(setupEnd-allStart)/1000});state({phase:'parallel_wave'});
 // Library groups are contiguous only in admission order; all 250 promises run together.
 const ordered=manifest.libraries.flatMap(lib=>jobs.filter(j=>j.libraryId===lib.libraryId));await Promise.all(ordered.map(searchOne));
 const waveEnd=Date.now();const perLibrary=manifest.libraries.map(lib=>{const rs=rows.filter(r=>r.libraryId===lib.libraryId),ok=rs.filter(r=>r.ok);return {libraryId:lib.libraryId,name:lib.name,attempts:rs.length,matchedReference:ok.length,nonempty:ok.filter(r=>r.result.returned>0).length,empty:ok.filter(r=>r.result.returned===0).length,errors:rs.filter(r=>!r.ok).map(r=>({jobId:r.jobId,error:r.error})),elapsedSeconds:(libCompleted.get(lib.libraryId)-libStarted.get(lib.libraryId))/1000,medianWireMs:quantile(rs.map(r=>r.wireMs).filter(x=>x!=null),.5),p95WireMs:quantile(rs.map(r=>r.wireMs).filter(x=>x!=null),.95),peakActiveJobs:libPeak.get(lib.libraryId)};});
 const summary={at:new Date().toISOString(),phase:completed.size===250?'spike_complete':'spike_incomplete',totalUniquePairs:250,attempted:rows.length,matchedReference:completed.size,errors:rows.filter(r=>!r.ok).length,setupSeconds:(setupEnd-allStart)/1000,concurrentWaveSeconds:(waveEnd-waveStart)/1000,totalSeconds:(waveEnd-allStart)/1000,actualPeakInFlight:wirePeak,rawCalls,perLibrary,mainAuditPaused:true};store.save('summary.json',summary);store.append({type:'parallel_spike_finished',...summary});state({phase:summary.phase,...summary});console.log(JSON.stringify(summary));
}catch(e){if(held){store.append({type:'parallel_spike_stopped',code:e.code||e.name,message:e.message});state({phase:'stopped',error:e.message});}console.error(e.message);process.exitCode=1;}
finally{if(held){store.save('origin-state.json',Object.fromEntries(['cooldowns','refusals','policyFailures','originReadyAt'].map(k=>[k,[...coordinator[k]]])));store.release();}if(mheld)machine.release();}
