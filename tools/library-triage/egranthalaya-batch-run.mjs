import {existsSync,readFileSync,statfsSync,writeFileSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {setTimeout as sleep} from 'node:timers/promises';
import {EvidenceStore} from '../../server/services/catalog-connectors/evidence.js';
import {Coordinator} from '../../server/services/catalog-connectors/transport.js';
import {TriageEvidenceStore} from './evidence.mjs';
import {readManifest,reduce} from './audit.mjs';
import {publishRecoverably} from './checkpoint-recovery.mjs';
import {CONFIG,sha,persistentMaps,catalogUrl,makeSession,requestBody,sessionCookie,inspectSearch,jobId,nextStartAt,summarizeLibrary,BatchEvidenceStore,exportBatch,csv} from './egranthalaya-batch-core.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export const DEFAULT='docs/research/india-library-audit/search-triage/egranthalaya-fifty-20261108';
const STATE='/workspace/library-audit-review/egranthalaya-fifty-supervisor';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const git=args=>{const r=spawnSync('git',args,{cwd:ROOT,encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024});if(r.status!==0)throw Error('Git '+args[0]+' failed; evidence remains saved: '+String(r.stderr||r.error?.message||'').slice(-600));return r.stdout.trim();};
export function initialize(directory){
 const root=new TriageEvidenceStore(directory);if(existsSync(join(directory,'manifest.json')))throw Error('Already initialized; resume existing queue');
 const parent=join(ROOT,'docs/research/india-library-audit/search-triage/india-20261108'),source=new TriageEvidenceStore(parent),m=readManifest(source),rows=reduce(m,source.events()),old=new Map(rows.map(r=>[r.libraryId,r]));
 const packPath=join(ROOT,'docs/research/india-library-audit/search-triage/planning/book-search-pack.json'),pack=read(packPath);
 const libraries=m.libraries.filter(l=>l.family==='egranthalaya').map(l=>{const route=l.routes.find(r=>r.family==='egranthalaya');return {...l,route,priorStatus:old.get(l.libraryId),previouslyUnchecked:!old.get(l.libraryId).assessed};}).sort((a,b)=>Number(b.previouslyUnchecked)-Number(a.previouslyUnchecked)||a.route.cluster.localeCompare(b.route.cluster)||a.libraryId.localeCompare(b.libraryId));
 for(const l of libraries)catalogUrl(l);
 const manifest={schemaVersion:1,purpose:'owner_authorized_egranthalaya_fifty_title_searches',createdAt:new Date().toISOString(),sourceManifest:{path:relative(ROOT,join(parent,'manifest.json')),sha256:sha(readFileSync(join(parent,'manifest.json'))),inventoryHash:m.inventoryHash},sourceJournalIndex:source.index(),sourceCheckpoint:git(['rev-parse','HEAD']),books:pack.books.slice(0,50),bookPackSha256:sha(readFileSync(packPath)),config:CONFIG,libraries,total:libraries.length,initiallyUnchecked:libraries.filter(l=>l.previouslyUnchecked).length,libraryHash:sha(libraries),bookHash:sha(pack.books.slice(0,50)),priorCountsAreNotFreshSampling:true};
 root.acquire();try{root.save('manifest.json',manifest);root.append({type:'fifty_run_initialized',total:manifest.total,initiallyUnchecked:manifest.initiallyUnchecked,config:CONFIG});report(root,manifest,[]);}finally{root.release();}return manifest;
}
export function checkManifest(root){const m=read(join(root.root,'manifest.json'));if(m.purpose!=='owner_authorized_egranthalaya_fifty_title_searches'||m.total!==m.libraries.length||new Set(m.libraries.map(l=>l.libraryId)).size!==m.total||sha(m.libraries)!==m.libraryHash||sha(m.books)!==m.bookHash||m.books.length!==50||new Set(m.books.map(b=>b.workId)).size!==50||JSON.stringify(m.config)!==JSON.stringify(CONFIG)||sha(readFileSync(join(ROOT,m.sourceManifest.path)))!==m.sourceManifest.sha256)throw Error('Frozen manifest/config mismatch');return m;}
export function report(root,m,events=root.events({cached:true})){
 const latest=new Map();for(const e of events)if(e.type==='fifty_library_outcome'){if(!m.libraries.some(l=>l.libraryId===e.libraryId))throw Error('Unknown library outcome');latest.set(e.libraryId,e);}
 const rows=m.libraries.map(l=>{const e=latest.get(l.libraryId);return {libraryId:l.libraryId,name:l.name,cluster:l.route.cluster,previouslyUnchecked:l.previouslyUnchecked,status:e?.outcome.status||'Pending',...(e?.outcome||{}),batchPath:e?.batchPath||'',observedAt:e?.observedAt||'',sourceEventId:e?.sourceEventId||''};});
 const done=[...latest.values()].map(e=>e.outcome);const progress={at:new Date().toISOString(),total:m.total,assessed:done.length,pending:m.total-done.length,working:done.filter(o=>o.status==='Working').length,needsWorkAssessed:done.filter(o=>o.status==='Needs work').length,blockedDeferred:done.filter(o=>o.status==='Blocked/deferred').length,twentyNativeBookRecords:done.filter(o=>o.twentyNativeBookRecords).length,validQueries:done.reduce((a,o)=>a+o.validQueries,0),failedQueries:done.reduce((a,o)=>a+o.failedQueries,0),initiallyUnchecked:m.initiallyUnchecked,newlyChecked:rows.filter(r=>r.previouslyUnchecked&&r.status!=='Pending').length,distinctNativeBookRecords:done.reduce((a,o)=>a+o.distinctNativeBookRecords,0),config:m.config,scope:'Native member-scoped first-page Title/Books searches; no item requests or app activation; old evidence remains separate.'};
 root.save('progress.json',progress);csv(join(root.root,'libraries.csv'),rows,['libraryId','name','cluster','status','queriesCompleted','validQueries','nonemptyQueries','emptyQueries','failedQueries','distinctNativeBookRecords','twentyNativeBookRecords','coverage','setupError','deferred','errorCounts','nextAction','previouslyUnchecked','batchPath','observedAt','sourceEventId']);return progress;
}
const terminal=new Set(['SOURCE_ACCESS_BLOCKED','PROVIDER_COOLDOWN','ROBOTS_DISALLOWED','ROBOTS_UNAVAILABLE','ACCESS_CHALLENGE']);
function guard(r){if(/<title[^>]*>\s*(?:Just a moment|Access denied|Attention Required)/i.test(r.text)||/cf-chl-/i.test(r.text))throw Object.assign(Error('Actual HTML access challenge; stop origin'),{code:'ACCESS_CHALLENGE'});if(!r.ok)throw Object.assign(Error('HTTP '+r.status),{code:'HTTP_'+r.status});}
export async function collectBatch(store,manifest,{signal,coordinator,fetchImpl=fetch,onProgress=()=>{}}){
 const prior=store.events({repairTail:true}),finished=new Map(prior.filter(e=>e.type==='batch_library_outcome').map(e=>[e.libraryId,e.outcome])),completed=new Map(prior.filter(e=>e.type==='batch_query_outcome'&&!e.interrupted).map(e=>[e.jobId,e]));
 let fatal=null,wire=0,peak=0,gate=Promise.resolve(),nextAdmission=0;const abort=new AbortController(),combined=AbortSignal.any([signal,abort.signal]);
 const metrics={requests:0,queries:0,errors:0,peak:0};
 class Lane extends Coordinator{
  constructor(){super({store,minGapMs:0,concurrency:1});for(const k of ['policies','policyExpires',...persistentMaps])this[k]=coordinator[k];this.fetch=async(url,options)=>{const c=this.current;const ticket=gate.catch(()=>{}).then(async()=>{const wait=Math.max(0,nextAdmission-Date.now());if(wait)await sleep(wait,undefined,{signal:options.signal});if(options.signal.aborted)throw options.signal.reason;this.check(c,url);nextAdmission=Date.now()+(c.crawlDelay||0);});gate=ticket;await ticket;c.wireStarted=true;c.wireAt=Date.now();wire++;peak=Math.max(peak,wire);metrics.peak=peak;metrics.requests++;store.append({type:'batch_network_started',libraryId:c.libraryId,jobId:c.jobId,attemptId:c.attemptId,inFlight:wire,method:options.method||'GET'});return fetchImpl(url,options);};}
  async raw(ctx,...args){this.current=ctx;ctx.wireStarted=false;try{return await super.raw(ctx,...args);}finally{if(ctx.wireStarted){wire--;store.append({type:'batch_network_finished',libraryId:ctx.libraryId,jobId:ctx.jobId,attemptId:ctx.attemptId,inFlightAfter:wire,wireMs:Date.now()-ctx.wireAt});}}}
 }
 const requestOptions={timeoutMs:CONFIG.requestTimeoutMs,maxResponseBytes:4*1024*1024,allowedResponseTypes:['text/html','application/xhtml+xml']};
 function noteFatal(error,ctx){if(terminal.has(error.code)&&!fatal){fatal={code:error.code,message:error.message};if(error.code==='ACCESS_CHALLENGE')coordinator.refusals.set('https://eg4.nic.in',{reason:error.message,at:new Date().toISOString(),attemptId:ctx.attemptId,sourceRunDirectory:store.root});abort.abort();}}
 function outcome(lib,options={}){const rows=[...completed.values()].filter(q=>q.libraryId===lib.libraryId);const o=summarizeLibrary(lib,rows,options);store.append({type:'batch_library_outcome',libraryId:lib.libraryId,outcome:o});finished.set(lib.libraryId,o);onProgress({metrics,finished:finished.size});}
 const sessions=new Map();
 await Promise.all(manifest.libraries.filter(l=>!finished.has(l.libraryId)).map(async(lib)=>{
  if(lib.route.savedBlocker){outcome(lib,{deferred:lib.route.savedBlocker});return;}
  if([...completed.values()].filter(q=>q.libraryId===lib.libraryId).length===50){outcome(lib);return;}
  const lane=new Lane(),ctx=lane.context({libraryId:lib.libraryId,allowedOrigins:['https://eg4.nic.in'],timeoutMs:CONFIG.requestTimeoutMs,signal:combined});
  try{const r=await ctx.request(catalogUrl(lib),{...requestOptions,headers:{Accept:'text/html'}});guard(r);const s=makeSession(lib,r,manifest.books[0].title);sessions.set(lib.libraryId,s);store.append({type:'batch_session_initialized',libraryId:lib.libraryId,identifierDigest:sha(s.value),evidence:ctx.evidence});}
  catch(e){noteFatal(e,ctx);store.append({type:'batch_setup_failed',libraryId:lib.libraryId,code:e.code||e.name,message:e.message,evidence:ctx.evidence,interrupted:signal.aborted||Boolean(fatal&&e.code!==fatal.code)});if(!signal.aborted&&!fatal)outcome(lib,{setupError:{code:e.code||e.name,message:e.message}});}
 }));
 if(new Set([...sessions.values()].map(s=>s.value)).size!==sessions.size)throw Error('Independent library sessions not established');
 // A batch retains only five sets of form state; no form/cookie is reused across libraries.
 if(!combined.aborted){const tasks=manifest.libraries.flatMap(lib=>manifest.books.map(book=>({lib,book}))).filter(({lib,book})=>sessions.has(lib.libraryId)&&!completed.has(jobId(lib,book)));store.append({type:'batch_search_wave_started',jobs:tasks.length});
 await Promise.all(tasks.map(async({lib,book})=>{
  const lane=new Lane(),ctx=lane.context({libraryId:lib.libraryId,allowedOrigins:['https://eg4.nic.in'],timeoutMs:CONFIG.requestTimeoutMs,signal:combined}),s=sessions.get(lib.libraryId),start=Date.now();ctx.jobId=jobId(lib,book);
  const row={libraryId:lib.libraryId,name:lib.name,jobId:ctx.jobId,workId:book.workId,query:book.title,requestedMember:lib.route.memberCode,startedAt:new Date(start).toISOString()};
  try{const r=await ctx.request(catalogUrl(lib),{...requestOptions,method:'POST',body:requestBody(lib,s,book.title),headers:{Accept:'text/html',Referer:catalogUrl(lib),'Content-Type':'application/x-www-form-urlencoded',Cookie:s.value}});guard(r);if(sessionCookie(r,s.value)!==s.value)throw Object.assign(Error('Library session changed'),{code:'SESSION_CHANGED'});row.result=inspectSearch(r.text,lib.route.memberCode,book.title);row.ok=true;}
  catch(e){row.ok=false;row.error={code:e.code||e.name,message:e.message};noteFatal(e,ctx);row.interrupted=signal.aborted||Boolean(fatal&&e.code!==fatal.code);metrics.errors++;}
  finally{row.wallMs=Date.now()-start;row.evidence=ctx.evidence;const saved=store.append({type:'batch_query_outcome',...row});if(!row.interrupted)completed.set(row.jobId,saved);metrics.queries++;onProgress({metrics,finished:finished.size});}
 }));}
 for(const lib of manifest.libraries)if(!finished.has(lib.libraryId)&&[...completed.values()].filter(q=>q.libraryId===lib.libraryId).length===50)outcome(lib);
 const errors=[...completed.values()].filter(q=>!q.ok),transport=errors.filter(q=>q.error?.code==='UPSTREAM_TIMEOUT'||q.error?.code?.startsWith('HTTP_5')||q.error?.code==='TypeError');
 return {metrics,fatal,interrupted:signal.aborted,complete:finished.size===manifest.libraries.length,overload:completed.size>=50&&transport.length/completed.size>=0.5};
}
export async function supervise(args=process.argv.slice(2)){
 const opt=(n,d)=>{const i=args.indexOf('--'+n);return i<0?d:args[i+1];};const directory=resolve(opt('dir',join(ROOT,DEFAULT))),stateDir=resolve(opt('state-dir',STATE));
 if(args.includes('--init'))return console.log(JSON.stringify({total:initialize(directory).total}));
 const require=createRequire(import.meta.url),{EnvHttpProxyAgent,setGlobalDispatcher}=require('undici');if(process.env.HTTP_PROXY||process.env.HTTPS_PROXY)setGlobalDispatcher(new EnvHttpProxyAgent());
 const root=new TriageEvidenceStore(directory),machine=new EvidenceStore(join(tmpdir(),'mybookshelf-library-connector-coordinator')),leader=new EvidenceStore(stateDir),publish=args.includes('--publish'),stop=new AbortController();
 let phase='starting',batch=null,lastStart=0,progress=null,expected=null,heartbeat=null,held=false,rheld=false,lheld=false;const path=relative(ROOT,directory);let batchProgress=null,publicationRetry=null,lastError=null,lastPublished=null;
 const save=()=>{if(!lheld)return;leader.save('progress.json',{pid:process.pid,host:leader.owner.host,startedAt:leader.owner.startedAt,at:new Date().toISOString(),phase,directory,batch,batchProgress,progress,lastBatchStartedAt:lastStart?new Date(lastStart).toISOString():null,nextBatchNotBefore:lastStart?new Date(lastStart+CONFIG.minBatchStartIntervalMs).toISOString():null,lastPublishedCommit:lastPublished,publicationRetry,lastError,publish});};
 const checkpoint=async()=>{phase='publishing';save();expected=await publishRecoverably({git,path,expectedLocal:expected,readState:()=>existsSync(join(stateDir,'publication.json'))?read(join(stateDir,'publication.json')):null,writeState:value=>leader.save('publication.json',value),signal:stop.signal,onRetry:value=>{publicationRetry=value;phase='publication_retry';save();console.error(JSON.stringify({type:'publication_retry',...value}));}});lastPublished=expected;publicationRetry=null;phase='publishing_complete';save();};
 const cancel=()=>stop.abort();process.once('SIGTERM',cancel);process.once('SIGINT',cancel);
 try{
  for(const p of ['/workspace/library-audit-review/search-triage-supervisor/writer.lock','/workspace/library-audit-review/link-supervisor/writer.lock'])if(existsSync(p))throw Error('Another supervisor owns the audit');
  leader.acquire();lheld=true;machine.acquire();held=true;root.acquire();rheld=true;const manifest=checkManifest(root);root.events({repairTail:true});root.validate();
  if(git(['branch','--show-current'])!=='feat/library-connector-audit'||git(['status','--porcelain','--','server','shared','tools/library-triage','tools/library-audit']))throw Error('Commit implementation changes before collection');
  expected=git(['rev-parse','HEAD']);
  progress=report(root,manifest);save();heartbeat=setInterval(()=>{if(existsSync(join(stateDir,'pause')))stop.abort();save();},5000);
  const coordinator=new Coordinator({store:root,minGapMs:0,concurrency:1});
  for(const p of [join(ROOT,'docs/research/india-library-audit/runs/india-20261107/origin-state.json'),join(ROOT,'docs/research/india-library-audit/revalidation/20261107/origin-state.json'),join(ROOT,'docs/research/india-library-audit/search-triage/india-20261108/origin-state.json'),join(directory,'origin-state.json')])if(existsSync(p))for(const k of persistentMaps)for(const [o,v] of read(p)[k]||[])if(k==='cooldowns'||k==='originReadyAt')coordinator[k].set(o,Math.max(coordinator[k].get(o)||0,v));else coordinator[k].set(o,v);
  const history=root.events({cached:true});lastStart=Date.parse(history.filter(e=>e.type==='fifty_batch_started').at(-1)?.startedAt||'')||0;
  const finishedBatches=new Set(history.filter(e=>e.type==='fifty_batch_complete').map(e=>e.batch));
  // Verify immutable finished evidence on resume; never infer success from a cursor alone.
  for(const e of history.filter(e=>e.type==='fifty_batch_complete')){const bs=new BatchEvidenceStore(join(directory,'batches',e.batch));bs.validate();if(sha(readFileSync(join(bs.root,'validation.json')))!==e.validationSha256||sha(readFileSync(join(bs.root,'summary.json')))!==e.summarySha256)throw Error('Completed batch checkpoint mismatch');} 
  // Publish preserved results before new provider requests, including an interrupted push.
  if(publish)await checkpoint();
  for(let offset=0;offset<manifest.total&&!stop.signal.aborted;offset+=5){
   batch=String(Math.floor(offset/5)+1).padStart(4,'0');if(finishedBatches.has(batch))continue;batchProgress=null;
   const fs=statfsSync(directory);if(fs.bavail*fs.bsize<2*1024**3)throw Error('Less than 2 GiB disk remaining; stop before evidence loss');
   if(existsSync(join(stateDir,'pause')))break;
   phase='waiting_between_batches';save();const wait=Math.max(0,nextStartAt(lastStart,Date.now())-Date.now());if(wait)await sleep(wait,undefined,{signal:stop.signal});if(stop.signal.aborted)break;
   const batchPath='batches/'+batch,bs=new BatchEvidenceStore(join(directory,batchPath)),bm={schemaVersion:1,batch,libraryHash:manifest.libraryHash,books:manifest.books,libraries:manifest.libraries.slice(offset,offset+5),config:CONFIG};
   bs.acquire();let result,exported;
   try{
    if(existsSync(join(bs.root,'manifest.json'))){if(JSON.stringify(read(join(bs.root,'manifest.json')))!==JSON.stringify(bm))throw Error('Batch manifest changed');}else bs.save('manifest.json',bm);
    lastStart=Date.now();root.append({type:'fifty_batch_started',batch,startedAt:new Date(lastStart).toISOString(),libraryIds:bm.libraries.map(l=>l.libraryId)});phase='collecting';save();
    result=await collectBatch(bs,bm,{signal:stop.signal,coordinator,onProgress:p=>{batchProgress=p;}});exported=exportBatch(bs,bm);bs.save('summary.json',{at:new Date().toISOString(),...result,libraryOutcomes:exported.outcomes});
   }finally{bs.release();root.save('origin-state.json',Object.fromEntries(persistentMaps.map(k=>[k,[...coordinator[k]]])));}
   const existing=new Set(root.events({cached:true}).filter(e=>e.type==='fifty_library_outcome').map(e=>e.libraryId));
   for(const outcome of exported.outcomes)if(!existing.has(outcome.libraryId)){const source=bs.events({cached:true}).findLast(e=>e.type==='batch_library_outcome'&&e.libraryId===outcome.libraryId);root.append({type:'fifty_library_outcome',libraryId:outcome.libraryId,outcome,batchPath,sourceEventId:source.eventId,observedAt:source.at});}
   if(result.complete)root.append({type:'fifty_batch_complete',batch,validationSha256:sha(readFileSync(join(bs.root,'validation.json'))),summarySha256:sha(readFileSync(join(bs.root,'summary.json')))});
   progress=report(root,manifest);root.validate();phase='publishing';save();if(publish)await checkpoint();
   console.log(JSON.stringify({batch,...result,assessed:progress.assessed,pending:progress.pending,commit:expected}));
   if(result.fatal||result.overload){phase=result.fatal?'paused_provider_refusal':'paused_high_transport_failure';save();return;}
   if(result.interrupted||!result.complete){phase='paused_interrupted';save();return;}
  }
  if(!progress.pending){
   phase='validating_final_report';save();const completed=root.events({cached:true}).filter(e=>e.type==='fifty_batch_complete');
   if(completed.length!==Math.ceil(manifest.total/5))throw Error('Final batch count mismatch');
   const artifacts=[];for(const e of completed){const bs=new BatchEvidenceStore(join(directory,'batches',e.batch));bs.validate();if(sha(readFileSync(join(bs.root,'validation.json')))!==e.validationSha256||sha(readFileSync(join(bs.root,'summary.json')))!==e.summarySha256)throw Error('Final batch hashes changed');artifacts.push({batch:e.batch,basePath:'batches/'+e.batch,files:['libraries.csv','queries.csv','results.csv','items.csv','failures.csv','validation.json','summary.json'].map(name=>({name,sha256:sha(readFileSync(join(bs.root,name)))}))});}
   root.save('final-report.json',{...progress,validatedAt:new Date().toISOString(),artifacts,definition:'Completed fifty-query assessment is not universal twenty-book success or verified item-link access.'});
   csv(join(directory,'artifact-index.csv'),artifacts.flatMap(a=>a.files.map(f=>({batch:a.batch,path:a.basePath+'/'+f.name,sha256:f.sha256}))));
   writeFileSync(join(directory,'final-report.md'),'# e-Granthalaya fifty-title search report\n\n'+JSON.stringify(progress,null,2)+'\n\nAll '+manifest.total+' frozen entries have an assessed outcome. Completion does not mean every library yielded twenty records.\n\n[Per-library status](libraries.csv) · [All query/result/item/failure CSV partitions and hashes](artifact-index.csv) · [Machine-readable report](final-report.json)\n\nResults are member-scoped native bibliographic records on the first Title/Books page. Empty queries are not evidence of an empty collection. Item URLs are saved but were not fetched; no app publication changed.\n');
   if(publish)await checkpoint();
  }
  phase=progress.pending?'paused':'fifty_search_queue_complete';save();
 }catch(e){phase=stop.signal.aborted?'paused_interrupted':'error';lastError={code:e.code||e.name,message:e.message,at:new Date().toISOString()};save();console.error(e.stack);if(!stop.signal.aborted)process.exitCode=1;}
 finally{clearInterval(heartbeat);if(rheld)root.release();if(held)machine.release();if(lheld)leader.release();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await supervise();
