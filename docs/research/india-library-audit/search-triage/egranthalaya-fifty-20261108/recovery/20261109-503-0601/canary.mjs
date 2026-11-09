import {readFileSync,existsSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const base=process.cwd(),mod=async p=>import(pathToFileURL(join(base,p)).href);
const {EvidenceStore}=await mod('server/services/catalog-connectors/evidence.js');
const {Coordinator}=await mod('server/services/catalog-connectors/transport.js');
const {TriageEvidenceStore}=await mod('tools/library-triage/evidence.mjs');
const {collectBatch}=await mod('tools/library-triage/egranthalaya-batch-run.mjs');
const {BatchEvidenceStore,persistentMaps,sha,CONFIG}=await mod('tools/library-triage/egranthalaya-batch-core.mjs');
const {EnvHttpProxyAgent,setGlobalDispatcher}=createRequire(pathToFileURL(join(base,'package.json')))('undici');
if(process.env.HTTP_PROXY||process.env.HTTPS_PROXY)setGlobalDispatcher(new EnvHttpProxyAgent());
const run='docs/research/india-library-audit/search-triage/egranthalaya-fifty-20261108';
const machine=new EvidenceStore('/tmp/mybookshelf-library-connector-coordinator'),root=new TriageEvidenceStore(join(base,run));
const read=p=>JSON.parse(readFileSync(p,'utf8'));let mh=false,rh=false;
try{
 machine.acquire();mh=true;root.acquire();rh=true;
 const m=read(join(root.root,'manifest.json')),pause=read('/workspace/library-audit-review/egranthalaya-fifty-supervisor/progress.json');
 if(pause.phase!=='paused_high_transport_failure')throw Error('Expected safely stopped transport pause');
 const folder='recovery/20261109-503-0601';if(existsSync(join(root.root,folder,'report.json')))throw Error('Recovery probe already completed; do not repeat');
 const coord=new Coordinator({store:root,minGapMs:0,concurrency:1});
 for(const p of ['docs/research/india-library-audit/runs/india-20261107/origin-state.json','docs/research/india-library-audit/revalidation/20261107/origin-state.json','docs/research/india-library-audit/search-triage/india-20261108/origin-state.json',run+'/origin-state.json'])if(existsSync(join(base,p)))for(const k of persistentMaps)for(const [o,v] of read(join(base,p))[k]||[])if(k==='cooldowns'||k==='originReadyAt')coord[k].set(o,Math.max(coord[k].get(o)||0,v));else coord[k].set(o,v);
 const reports=[];
 for(const index of [3000,3005]){
  const lib=m.libraries[index],book=m.books.find(b=>b.workId==='book-019');
  const savedPath=join(root.root,folder,String(index),'report.json');
  if(existsSync(savedPath)){const savedStore=new BatchEvidenceStore(join(root.root,folder,String(index)));savedStore.validate();const cached=read(savedPath);reports.push(cached);console.log(JSON.stringify({type:'saved_probe_finalization',libraryId:cached.libraryId,observedAt:cached.at,ok:cached.ok,newRequests:0}));if(!cached.ok)break;continue;}
  const store=new BatchEvidenceStore(join(root.root,folder,String(index)));store.acquire();
  try{
   const manifest={purpose:'single_query_transport_recovery_probe_not_library_qualification',sourceLibraryHash:m.libraryHash,sourceBookHash:m.bookHash,libraries:[lib],books:[book],config:CONFIG};store.save('manifest.json',manifest);
   const result=await collectBatch(store,manifest,{signal:AbortSignal.timeout(390000),coordinator:coord});
   const rows=store.events({cached:true}),query=rows.findLast(e=>e.type==='batch_query_outcome');
   const report={at:new Date().toISOString(),libraryId:lib.libraryId,name:lib.name,query:book.title,ok:query?.ok===true,returned:query?.result?.returned??null,total:query?.result?.total??null,error:query?.error||rows.findLast(e=>e.type==='batch_setup_failed')||null,sourceEventId:query?.eventId||null,metrics:result.metrics,validation:store.validate(),qualificationCredit:0};
   store.save('report.json',report);reports.push(report);console.log(JSON.stringify(report));
   if(!report.ok||result.fatal)break;
  }finally{store.release();}
 }
 const store=new BatchEvidenceStore(join(root.root,folder));store.acquire();
 try{
 if(existsSync(join(store.root,'canary.mjs'))&&!existsSync(join(store.root,'canary.initial.mjs')))copyFileSync(join(store.root,'canary.mjs'),join(store.root,'canary.initial.mjs'));
 copyFileSync(fileURLToPath(import.meta.url),join(store.root,'canary.mjs'));
 const report={at:new Date().toISOString(),trigger:{batch:'0601',stoppedAt:pause.at,errors:230,queries:250,cause:'HTTP_503'},method:'At most two serial one-title native probes using unchanged governed collector; first repeats exact failed Train to Pakistan query, second tests next queued library. Original failures retained; no library pass/count added.',configUnchanged:true,sourceHashes:Object.fromEntries(['tools/library-triage/egranthalaya-batch-run.mjs','tools/library-triage/egranthalaya-batch-core.mjs'].map(p=>[p,sha(readFileSync(join(base,p)))])),reports,recovered:reports.length===2&&reports.every(r=>r.ok),qualificationCredit:0};
 store.save('report.json',report);root.append({type:'fifty_transport_recovery_review',triggerBatch:'0601',reportPath:folder+'/report.json',reportSha256:sha(readFileSync(join(store.root,'report.json'))),recovered:report.recovered,qualificationCredit:0});
 root.save('origin-state.json',Object.fromEntries(persistentMaps.map(k=>[k,[...coord[k]]])));
 console.log(JSON.stringify({recovered:report.recovered,reportPath:folder+'/report.json'}));
 }finally{store.release();}
}finally{if(rh)root.release();if(mh)machine.release();}
