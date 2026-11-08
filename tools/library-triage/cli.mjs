#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir, hostname } from 'node:os';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { EvidenceStore } from '../../server/services/catalog-connectors/evidence.js';
import { Coordinator } from '../../server/services/catalog-connectors/transport.js';
import { ConnectorService } from '../../server/services/catalog-connectors/service.js';
import { SharedSearchService } from './structured.mjs';
import { ROOT, DEFAULT_DIR, initialize, readManifest, pendingJobs, runBatch, report, validate } from './audit.mjs';

const [command,...args]=process.argv.slice(2);
const value=(key,fallback)=>{const i=args.indexOf('--'+key);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing --'+key+' value');return args[i+1];};
if(!command||command==='help') {
  console.log('library-triage init|preflight|run|report|validate --dir PATH\nrun [--limit 10 | --all] [--concurrency 3] [--libraries id,id] [--retry-reason TEXT]\nOnly run contacts providers. No browser, app changes, scheduling, accounts or auto-deployment.');
  process.exit(0);
}
if(!['init','preflight','run','report','validate'].includes(command))throw Error('Unknown command');
const known=new Set(['--dir','--limit','--all','--concurrency','--libraries','--retry-reason']);
for(let i=0;i<args.length;i++) {if(!known.has(args[i]))throw Error('Unknown argument '+args[i]);if(args[i]!=='--all')i++;}
const dir=resolve(value('dir',DEFAULT_DIR));
// Never reuse or rewrite the frozen comprehensive audit/repair directories.
for(const old of ['runs/india-20261107','revalidation/20261107']) {
  const forbidden=join(ROOT,'docs/research/india-library-audit',old);
  if(dir===forbidden||dir.startsWith(forbidden+'/'))throw Error('Use a separate search-triage directory');
}
const store=new EvidenceStore(dir), machine=new EvidenceStore(join(tmpdir(),'mybookshelf-library-connector-coordinator'));
const controller=new AbortController();
process.once('SIGINT',()=>controller.abort());process.once('SIGTERM',()=>controller.abort());
let held=false,machineHeld=false,coordinator,timer;
const gitHead=()=>{
  const r=spawnSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'});
  if(r.status!==0)throw Error('Cannot establish code checkpoint');return r.stdout.trim();
};
const originFiles=[
  join(ROOT,'docs/research/india-library-audit/runs/india-20261107/origin-state.json'),
  join(ROOT,'docs/research/india-library-audit/revalidation/20261107/origin-state.json'),
  join(dir,'origin-state.json'),
];
function saveOrigins(){if(coordinator)store.save('origin-state.json',Object.fromEntries(['cooldowns','refusals','policyFailures','originReadyAt'].map(k=>[k,[...coordinator[k]]])));}
try {
  if(command==='validate') {console.log(JSON.stringify(validate(store)));process.exitCode=0;}
  else {
    const reservation='/workspace/library-audit-review/search-triage-supervisor/writer.lock';
    if(existsSync(reservation) && JSON.parse(readFileSync(reservation,'utf8')).id !== process.env.LIBRARY_TRIAGE_SUPERVISOR_ID)throw Error('Search triage supervisor owns the reservation; do not overlap');
    // Parent supervisors also reserve editing/collection between child batches.
    if(existsSync('/workspace/library-audit-review/link-supervisor/writer.lock'))throw Error('Legacy link supervisor owns a reservation; do not overlap');
    machine.acquire();machineHeld=true;store.acquire();held=true;
    store.events({repairTail:true,cached:true});
    if(command==='init') {initialize(store);console.log(JSON.stringify(report(store)));}
    else {
      const manifest=readManifest(store);
      if(command==='report')console.log(JSON.stringify(report(store)));
      else if(command==='preflight')console.log(JSON.stringify({ ...validate(store),pendingJobs:pendingJobs(manifest,store.events()).length,providerRequests:0,policy:manifest.policy }));
      else {
        const limit=args.includes('--all')?manifest.total:Number(value('limit','10'));
        const concurrency=Number(value('concurrency','3'));
        if(args.includes('--all')&&args.includes('--limit'))throw Error('Choose --all or --limit');
        if(!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>6)throw Error('Invalid request budget');
        const ids=value('libraries',null)?.split(',')||null,retryReason=value('retry-reason',null);
        pendingJobs(manifest,store.events(),{ids,retryReason}); // reject bad inputs before network setup
        validate(store);
        if(process.env.HTTPS_PROXY||process.env.HTTP_PROXY)setGlobalDispatcher(new EnvHttpProxyAgent());
        coordinator=new Coordinator({store,concurrency});
        for(const p of originFiles)if(existsSync(p)) {
          const s=JSON.parse(readFileSync(p,'utf8'));
          for(const k of ['cooldowns','refusals','policyFailures','originReadyAt'])for(const [origin,v] of s[k]||[]) {
            if(k==='cooldowns'||k==='originReadyAt')coordinator[k].set(origin,Math.max(coordinator[k].get(origin)||0,v));
            else coordinator[k].set(origin,v);
          }
        }
        const service=new SharedSearchService(new ConnectorService({coordinator,secret:randomBytes(32).toString('hex')}));
        const head=gitHead();
        const heartbeat=()=>store.save('execution.json',{phase:controller.signal.aborted?'stopping':'running',at:new Date().toISOString(),pid:process.pid,host:hostname(),startedAt:store.owner.startedAt,sourceCommit:head});
        timer=setInterval(heartbeat,10000);heartbeat();
        store.append({type:'triage_run_started',limit,concurrency,ids,retryReason,sourceCommit:head});
        let checkpointCount=0;
        const summary=await runBatch(store,service,manifest,{limit,concurrency,ids,retryReason,signal:controller.signal,onCheckpoint:()=>{
          saveOrigins();
          if(gitHead()!==head)throw Error('Code checkpoint changed during collection');
          // Attempts are journaled immediately; avoid rewriting full CSV exports
          // after each individual library in a large run.
          if(++checkpointCount%10===0)report(store);
        }});
        validate(store);report(store);saveOrigins();
        const phase=controller.signal.aborted?'interrupted':summary.pending?'batch_complete':'triage_complete';
        store.append({type:'triage_run_stopped',phase,summary});
        store.save('execution.json',{phase,at:new Date().toISOString(),pid:process.pid,host:hostname(),...summary});
        console.log(JSON.stringify({phase,...summary}));
      }
    }
  }
}catch(error){
  if(held){saveOrigins();store.append({type:'triage_worker_error',code:error.code||error.name,reason:error.message});store.save('execution.json',{phase:'error',at:new Date().toISOString(),reason:error.message});}
  console.error(error.message);process.exitCode=1;
}finally{clearInterval(timer);if(held)store.release();if(machineHeld)machine.release();}
