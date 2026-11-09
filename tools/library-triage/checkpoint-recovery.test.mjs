import test from 'node:test';
import assert from 'node:assert/strict';
import {publishRecoverably,retryGit,transientGitError} from './checkpoint-recovery.mjs';
const path='docs/research/india-library-audit/search-triage/egranthalaya-fifty-20261108';
function fixture(){
 const s={head:'base',remote:'base',staged:'',dirty:true,commits:0,fetches:0,pushes:0,calls:[],saved:null,message:'',failFetch:0,failPush:0,ackLost:false};
 const git=a=>{s.calls.push(a);switch(a[0]){
  case 'branch':return 'feat/library-connector-audit';
  case 'rev-parse':return a[1]==='FETCH_HEAD'?s.remote:a[1]==='HEAD^'?'base':s.head;
  case 'diff':return s.staged;
  case 'fetch':s.fetches++;if(s.failFetch-->0)throw Error('Git fetch failed: error: 503');return '';
  case 'add':s.staged=s.dirty?path+'/events.jsonl':'';return '';
  case 'commit':s.commits++;s.head='commit';s.message=a[2];s.staged='';s.dirty=false;return '';
  case 'log':return s.message;
  case 'diff-tree':return path+'/events.jsonl';
  case 'push':s.pushes++;if(s.failPush-->0){if(s.ackLost)s.remote=s.head;throw Error('Git push failed: connection reset');}s.remote=s.head;return '';
  default:throw Error('Unexpected git '+a.join(' '));
 }};
 const opts={git,path,expectedLocal:'base',readState:()=>s.saved,writeState:x=>{s.saved=structuredClone(x);},wait:async()=>{}};return {s,opts};
}
test('a transient fetch 503 retries then publishes once',async()=>{const {s,opts}=fixture();s.failFetch=1;const retry=[];assert.equal(await publishRecoverably({...opts,onRetry:r=>retry.push(r)}),'commit');assert.equal(s.fetches,2);assert.equal(s.commits,1);assert.equal(s.pushes,1);assert.equal(retry[0].delayMs,30000);assert.equal(s.saved.phase,'published');});
test('lost push acknowledgement retries the same commit without duplicate commits or force',async()=>{const {s,opts}=fixture();s.failPush=1;s.ackLost=true;assert.equal(await publishRecoverably(opts),'commit');assert.equal(s.pushes,2);assert.equal(s.commits,1);assert(!s.calls.flat().some(x=>String(x).includes('--force')));});
test('restart resumes committed but unpublished checkpoint before collecting more',async()=>{const {s,opts}=fixture();s.failPush=1;const signal=new AbortController();await assert.rejects(publishRecoverably({...opts,signal:signal.signal,onRetry:()=>signal.abort()}));assert.equal(s.head,'commit');assert.equal(s.remote,'base');assert.equal(s.saved.commit,'commit');assert.equal(await publishRecoverably({...opts,expectedLocal:'commit'}),'commit');assert.equal(s.commits,1);assert.equal(s.remote,'commit');});
test('restart recognizes already-published commit after acknowledgement loss',async()=>{const {s,opts}=fixture();s.failPush=1;s.ackLost=true;const signal=new AbortController();await assert.rejects(publishRecoverably({...opts,signal:signal.signal,onRetry:()=>signal.abort()}));assert.equal(s.saved.phase,'pending');assert.equal(await publishRecoverably({...opts,expectedLocal:'commit'}),'commit');assert.equal(s.pushes,1);assert.equal(s.saved.phase,'published');});
test('interruption between commit and saving SHA recovers only the scoped marked commit',async()=>{const {s,opts}=fixture();await assert.rejects(publishRecoverably({...opts,writeState:x=>{if(x.commit)throw Error('Simulated process loss');opts.writeState(x);}}));assert.equal(s.head,'commit');assert.equal(s.saved.commit,undefined);assert.equal(await publishRecoverably({...opts,expectedLocal:'commit'}),'commit');assert.equal(s.commits,1);});
test('remote divergence fails before staging or pushing',async()=>{const {s,opts}=fixture();s.remote='someone-else';await assert.rejects(publishRecoverably(opts),/Remote branch changed/);assert(!s.calls.some(a=>['add','commit','push'].includes(a[0])));});
test('unrelated staged files remain untouched',async()=>{const {s,opts}=fixture();s.staged='client/unrelated.ts';await assert.rejects(publishRecoverably(opts),/Unrelated staged/);assert.equal(s.fetches,0);assert.equal(s.staged,'client/unrelated.ts');});
test('authentication errors are surfaced rather than retried indefinitely',async()=>{let calls=0;await assert.rejects(retryGit(()=>{calls++;throw Error('Authentication failed');},{wait:async()=>{throw Error('must not wait');}}),/Authentication/);assert.equal(calls,1);assert.equal(transientGitError(Error('Git push failed: HTTP 403')),false);});
test('retry backoff is capped and remains interruptible',async()=>{let calls=0;const retry=[];assert.equal(await retryGit(()=>{if(++calls<=6)throw Error('error: 503');return 'ok';},{onRetry:x=>retry.push(x.delayMs),wait:async()=>{}}),'ok');assert.deepEqual(retry,[30000,60000,120000,240000,300000,300000]);});
