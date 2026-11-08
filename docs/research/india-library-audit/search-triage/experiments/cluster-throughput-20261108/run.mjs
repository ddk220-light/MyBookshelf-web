import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {EvidenceStore} from '/workspace/MyBookshelf-web-india-library-audit/server/services/catalog-connectors/evidence.js';
import {Coordinator} from '/workspace/MyBookshelf-web-india-library-audit/server/services/catalog-connectors/transport.js';
import {searchForm,parseCatalogSearch} from '/workspace/MyBookshelf-web-india-library-audit/server/services/providers/egranthalaya.js';
const root='/workspace/MyBookshelf-web-india-library-audit',dir='/workspace/library-audit-review/cluster-throughput-benchmark-20261108',require=createRequire(root+'/package.json');
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
import {setTimeout as sleep} from 'node:timers/promises';
import {performance} from 'node:perf_hooks';
const manifest=JSON.parse(readFileSync(dir+'/manifest.json')),jobs=manifest.jobs,canaries=jobs.slice(0,10),baseline=new Map(),completed=new Map(),stages=[];
const allStart=Date.now(),cancel=new AbortController();process.once('SIGTERM',()=>cancel.abort());process.once('SIGINT',()=>cancel.abort());
let intervalMs=1000,gateTail=Promise.resolve(),nextStart=0,wireActive=0,wirePeak=0,stageWirePeak=0,rawCalls=0,fatal=null;
async function admission(ctx){const ticket=gateTail.catch(()=>{}).then(async()=>{if(cancel.signal.aborted)throw Error('Benchmark stopped');const wait=Math.max(0,nextStart-Date.now());if(wait)await sleep(wait,undefined,{signal:cancel.signal});nextStart=Date.now()+Math.max(intervalMs,ctx.crawlDelay||0);});gateTail=ticket;await ticket;}
class Lane extends Coordinator{
 constructor(slot){super({store,minGapMs:0,concurrency:1});this.slot=slot;for(const k of ['policies','policyExpires','policyFailures','cooldowns','refusals','originReadyAt'])this[k]=coordinator[k];this.fetch=async(url,options)=>{const ctx=this.current;await admission(ctx);if(options.signal?.aborted)throw Error('Request expired before network admission');ctx.wireAt=Date.now();ctx.networkWasStarted=true;wireActive++;wirePeak=Math.max(wirePeak,wireActive);stageWirePeak=Math.max(stageWirePeak,wireActive);rawCalls++;store.append({type:'benchmark_network_started',libraryId:ctx.libraryId,attemptId:ctx.attemptId,slot,stage:ctx.stage,jobId:ctx.jobId,atNetworkStart:new Date(ctx.wireAt).toISOString(),inFlight:wireActive,method:options.method||'GET'});return fetch(url,options);};}
 async raw(ctx,...args){this.current=ctx;ctx.networkWasStarted=false;try{return await super.raw(ctx,...args);}finally{if(ctx.networkWasStarted){const ms=Date.now()-ctx.wireAt;ctx.lastWireMs=ms;wireActive--;store.append({type:'benchmark_network_finished',libraryId:ctx.libraryId,attemptId:ctx.attemptId,slot:this.slot,stage:ctx.stage,jobId:ctx.jobId,wireMs:ms,inFlightAfter:wireActive});ctx.networkWasStarted=false;}}}
}
const lanes=Array.from({length:10},(_,i)=>new Lane(i)),sessions=[];
const urlFor=j=>{const u=new URL('https://eg4.nic.in/OPAC/Default.aspx');u.search=new URLSearchParams({CL_NAME:j.cluster,LIB_CODE:j.memberCode});return u.toString();};
const options={maxResponseBytes:4*1024*1024,allowedResponseTypes:['text/html','application/xhtml+xml'],timeoutMs:45000};
const quantile=(a,p)=>{a=[...a].sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.ceil(p*a.length)-1)]??null;};
const recordKey=r=>JSON.stringify(r.map(x=>[x.recordId,x.title]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
async function initializeSession(lane){const j=jobs[0],ctx=lane.context({libraryId:j.libraryId,allowedOrigins:['https://eg4.nic.in'],timeoutMs:120000,signal:cancel.signal});ctx.stage='session_setup';const r=await ctx.request(urlFor(j),{...options,headers:{Accept:'text/html'}});guard(r);const c=cookie(r),fields=searchForm(r.text,{libraryCode:j.memberCode,query:j.query,field:'TITLE'});if(!c||!fields)throw Error('Session bootstrap unrecognized');const s={value:c,fields,initialDigest:sha(c)};store.append({type:'benchmark_session_initialized',slot:lane.slot,evidence:ctx.evidence.at(-1),identifierDigest:s.initialDigest});return s;}
function state(extra={}){store.save('progress.json',{at:new Date().toISOString(),pid:process.pid,phase:'benchmark',elapsedSeconds:(Date.now()-allStart)/1000,totalUnique:250,completedUnique:completed.size,remainingUnique:250-completed.size,wireActive,peakInFlight:wirePeak,rawCalls,stages,...extra});}
async function runStage({name,mode,concurrency,work,capRps,compare=true}){
 intervalMs=1000/capRps;stageWirePeak=0;let next=0;const observed=[];const start=performance.now();let stageError=false;
 store.append({type:'benchmark_stage_started',name,mode,concurrency,capRps,jobs:work.length});state({stage:name});
 await Promise.all(Array.from({length:concurrency},async(_,slot)=>{
  while(next<work.length&&!fatal&&!stageError&&!cancel.signal.aborted){const j=work[next++],lane=lanes[slot],session=mode==='shared'?sessions[0]:sessions[slot];const begin=Date.now();const ctx=lane.context({libraryId:j.libraryId,allowedOrigins:['https://eg4.nic.in'],timeoutMs:120000,signal:cancel.signal});ctx.stage=name;ctx.jobId=j.jobId;const row={stage:name,mode,configuredConcurrency:concurrency,jobId:j.jobId,libraryId:j.libraryId,name:j.name,query:j.query,workId:j.workId,requestedMember:j.memberCode,startedAt:new Date(begin).toISOString(),isRepeatedCanary:baseline.has(j.jobId),slot};
   try{
    const fields=new URLSearchParams(session.fields);fields.set('DDL_Library',j.memberCode);fields.set('txt_Search',j.query);
    const r=await ctx.request(urlFor(j),{...options,method:'POST',body:fields.toString(),headers:{Accept:'text/html',Referer:urlFor(j),'Content-Type':'application/x-www-form-urlencoded',Cookie:session.value}});guard(r);
    const parsed=inspect(r,j.memberCode,j.query);row.result=parsed;row.evidence=ctx.evidence.at(-1);row.sessionStable=cookie(r,session.value)===session.value;
    if(!parsed.recognizedSearch||!row.sessionStable)throw Error('Query/library/session contract mismatch');
    const original=baseline.get(j.jobId);if(compare&&original){row.sameRecordSet=recordKey(original.records)===recordKey(parsed.records);row.sameTotal=original.total===parsed.total;if(!row.sameRecordSet||!row.sameTotal)throw Error('Native result set differs from serial canary');}
    if(!original&&name==='serial_baseline')baseline.set(j.jobId,parsed);
    row.ok=true;completed.set(j.jobId,row);
   }catch(e){row.ok=false;row.error={code:e.code||e.name,message:e.message};stageError=true;if(['SOURCE_ACCESS_BLOCKED','PROVIDER_COOLDOWN','ROBOTS_DISALLOWED','ROBOTS_UNAVAILABLE'].includes(e.code)||/Access challenge/i.test(e.message)){fatal=row.error;cancel.abort();}}
   row.finishedAt=new Date().toISOString();row.wallMs=Date.now()-begin;row.wireMs=ctx.lastWireMs??null;row.localWaitMs=Math.max(0,row.wallMs-(row.wireMs||0));observed.push(row);store.append({type:'benchmark_search_result',...row});if(observed.length%10===0||!row.ok)state({stage:name,stageCompleted:observed.length,stageTotal:work.length});
  }
 }));
 const elapsedMs=performance.now()-start,ok=observed.filter(r=>r.ok),lat=observed.map(r=>r.wireMs).filter(x=>x!=null),summary={name,mode,concurrency,capRps,planned:work.length,attempted:observed.length,ok:ok.length,empty:ok.filter(r=>!r.result.returned).length,nonempty:ok.filter(r=>r.result.returned>0).length,errors:observed.filter(r=>!r.ok).map(r=>({jobId:r.jobId,error:r.error})),elapsedSeconds:elapsedMs/1000,searchesPerSecond:ok.length/(elapsedMs/1000),medianWireMs:quantile(lat,.5),p95WireMs:quantile(lat,.95),peakInFlight:stageWirePeak,complete:ok.length===work.length};
 stages.push(summary);store.append({type:'benchmark_stage_completed',...summary});state();console.log(JSON.stringify(summary));return summary;
}
let held=false,mheld=false;
try{
 machine.acquire();mheld=true;store.acquire();held=true;store.append({type:'benchmark_started',manifestJobs:250,maxInFlight:10,maxRequestStartsPerSecond:2,mainAuditRemainsPaused:true});sessions.push(await initializeSession(lanes[0]));
 const serial=await runStage({name:'serial_baseline',mode:'shared',concurrency:1,work:canaries,capRps:1,compare:false});if(!serial.complete)throw Error('Serial baseline incomplete');
 let best=serial;
 for(const mode of ['shared','separate']){
  let previous=serial;
  for(const n of [2,5,10]){
   if(fatal||cancel.signal.aborted)break;
   if(mode==='separate')while(sessions.length<n)sessions.push(await initializeSession(lanes[sessions.length]));
   const r=await runStage({name:mode+'_'+n,mode,concurrency:n,work:canaries,capRps:n<=2?1:2});
   const latencyOK=r.p95WireMs<=Math.max(20000,serial.p95WireMs*2.5);
   if(r.complete&&latencyOK&&r.searchesPerSecond>best.searchesPerSecond)best=r;
   if(!r.complete||!latencyOK||r.searchesPerSecond<previous.searchesPerSecond*1.1){store.append({type:'benchmark_ramp_stopped',mode,atConcurrency:n,reason:!r.complete?'errors_or_mismatch':!latencyOK?'latency_inflation':'less_than_ten_percent_gain',previousRate:previous.searchesPerSecond,currentRate:r.searchesPerSecond});break;}
   previous=r;
  }
 }
 if(fatal||cancel.signal.aborted)throw Error('Source refusal or operator stop; no further searches');
 store.save('selected-configuration.json',{selectedAt:new Date().toISOString(),selected:best,basis:'Fastest correct measured balanced ten-job canary without material latency inflation; not an unrestricted maximum'});
 const remaining=jobs.filter(j=>!completed.has(j.jobId));
 const bulk=await runStage({name:'remaining_unique_matrix',mode:best.mode,concurrency:best.concurrency,work:remaining,capRps:best.capRps,compare:false});
 state({phase:completed.size===250?'benchmark_complete':'benchmark_incomplete',selectedConfiguration:best,actualTotalSeconds:(Date.now()-allStart)/1000});store.append({type:'benchmark_finished',completedUnique:completed.size,totalUnique:250,actualTotalSeconds:(Date.now()-allStart)/1000,selectedConfiguration:best,bulk});
}catch(e){store.append({type:'benchmark_stopped',code:e.code||e.name,message:e.message,completedUnique:completed.size});state({phase:'stopped',error:e.message});console.error(e.message);process.exitCode=1;}
finally{if(held){store.save('origin-state.json',Object.fromEntries(['cooldowns','refusals','policyFailures','originReadyAt'].map(k=>[k,[...coordinator[k]]])));store.release();}if(mheld)machine.release();}
