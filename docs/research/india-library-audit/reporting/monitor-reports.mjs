import {existsSync,readFileSync,writeFileSync,openSync,closeSync,unlinkSync,mkdirSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {hostname} from 'node:os';
import {spawnSync} from 'node:child_process';

// Report-only sidecar. It does not collect data, contact providers, change the
// app, publish Git commits, or touch the collector's locks and owned files.
const repo='/workspace/MyBookshelf-web-india-library-audit';
const root='/workspace/library-audit-review';
const repair=join(repo,'docs/research/india-library-audit/revalidation/20261107');
const full=join(repo,'docs/research/india-library-audit/runs/india-20261107');
mkdirSync(root,{recursive:true});
const lock=join(root,'report-monitor.lock'),fd=openSync(lock,'wx',0o600);
writeFileSync(fd,JSON.stringify({pid:process.pid,host:hostname(),startedAt:new Date().toISOString(),purpose:'read-only report monitor; not a provider collector'}));
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const statePath=join(root,'report-monitor.json');
let state=existsSync(statePath)?read(statePath):{schemaVersion:1,nextMilestones:{repair_revalidation:400,full_audit:600},exports:[]};
let stopped=false,lastVersion=null;
function save(extra={}){state={...state,...extra,pid:process.pid,host:hostname(),heartbeat:new Date().toISOString()};const temp=statePath+'.tmp';writeFileSync(temp,JSON.stringify(state,null,2)+'\n');renameSync(temp,statePath);}
function snapshot(){const result=spawnSync(process.execPath,[join(root,'export-review.mjs')],{cwd:repo,encoding:'utf8',timeout:120000,maxBuffer:1024*1024});if(result.status!==0)throw Error('Review export failed: '+String(result.stderr||result.error?.message||'unknown').slice(0,500));const summary=read(join(root,'current/summary.json'));state.exports.push({at:summary.generatedAt,phase:summary.phase,reviewed:summary.reviewed,remaining:summary.remainingInCohort});return summary;}
function tick(){
 if(stopped)return;
 try{
  const control=read(join(full,'audit-control.json')),phase=control.resumeAllowed===false?'repair_revalidation':'full_audit';
  const progress=read(join(phase==='repair_revalidation'?repair:full,'execution.json'));
  let reviewed=phase==='repair_revalidation'?progress.reviewed:progress.assessed;
  if(phase==='repair_revalidation'){const gate=read(join(repair,'gate-report.json'));if(gate.libraries?.some(row=>row.libraryId==='discovery-academic:librarika-bncollege'&&row.classification==='confirmed_access_block'))reviewed--;}
  const version=phase+':'+(progress.at||'');
  if(version!==lastVersion&&Number.isFinite(reviewed)){
   if(reviewed>=state.nextMilestones[phase]){
    const summary=snapshot(),threshold=Math.floor(summary.reviewed/100)*100;
    state.nextMilestones[phase]=threshold+100;
    save({phase,lastSnapshotAt:summary.generatedAt,lastReviewed:summary.reviewed,latestMilestone:threshold,error:null});
    console.log(JSON.stringify({type:'milestone_snapshot_saved',phase,milestone:threshold,reviewed:summary.reviewed,at:summary.generatedAt}));
   }
   lastVersion=version;
  }
  save({phase,observedCollectorReviewed:reviewed,observedCollectorCheckpoint:progress.at,collectorPausedForRepairs:control.resumeAllowed===false});
 }catch(error){save({error:error.message});console.error(JSON.stringify({at:new Date().toISOString(),error:error.message}));}
}
function stop(){if(stopped)return;stopped=true;clearInterval(timer);save({phase:'report_monitor_stopped'});closeSync(fd);unlinkSync(lock);}
const timer=setInterval(tick,30000);process.once('SIGINT',stop);process.once('SIGTERM',stop);tick();
