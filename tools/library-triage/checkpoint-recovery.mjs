import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';

const BRANCH='feat/library-connector-audit';
export function transientGitError(error){
 const message=String(error.message||error);
 if(/authentication failed|permission denied|could not read Username|repository not found|non-fast-forward|\[rejected\]|HTTP (?:401|403)|error: (?:401|403)/i.test(message))return false;
 return /(?:HTTP|error:)\s*(?:429|5\d\d)|timed? out|timeout|connection reset|disconnect\/reset|remote refused stream|could not resolve host|couldn't connect|failed to connect|unable to connect|TLS connection was non-properly terminated|remote end hung up|RPC failed|ETIMEDOUT|ECONNRESET|EAI_AGAIN/i.test(message);
}
export async function retryGit(operation,{signal,onRetry=()=>{},wait=ms=>sleep(ms,undefined,{signal}),operationName='git'}={}){
 let attempt=0;
 for(;;){
  signal?.throwIfAborted();
  try{return operation();}
  catch(error){
   if(signal?.aborted||!transientGitError(error))throw error;
   attempt++;const delayMs=Math.min(300000,30000*2**Math.min(attempt-1,4));
   onRetry({operation:operationName,attempt,delayMs,retryAt:new Date(Date.now()+delayMs).toISOString(),message:error.message});
   // Keep waits interruptible and heartbeat-friendly; do not hammer a failed Git endpoint.
   for(let left=delayMs;left>0;left-=30000){signal?.throwIfAborted();await wait(Math.min(left,30000));}
  }
 }
}
function scoped(names,path){return !names||names.split('\n').every(n=>n.startsWith(path+'/'));}
export async function publishRecoverably({git,path,expectedLocal,readState=()=>null,writeState=()=>{},signal,onRetry,wait}){
 if(!/^docs\/research\/india-library-audit\/search-triage\//.test(path)||path.split('/').includes('..'))throw Error('Unapproved publication scope');
 if(git(['branch','--show-current'])!==BRANCH)throw Error('Audit branch changed');
 let transaction=readState();if(transaction?.phase==='published')transaction=null;
 const head=git(['rev-parse','HEAD']);
 if(transaction){
  if(transaction.path!==path)throw Error('Publication transaction belongs to another run');
  if(transaction.commit){if(head!==transaction.commit)throw Error('Local branch changed during pending publication');}
  else if(head!==transaction.base){
   // Recover a process exit immediately after commit, before its SHA was saved.
   if(git(['rev-parse','HEAD^'])!==transaction.base||!git(['log','-1','--format=%B']).includes('Audit-publication-id: '+transaction.id)||!scoped(git(['diff-tree','--no-commit-id','--name-only','-r','HEAD']),path))throw Error('Unrecognized local commit; reconcile before publishing');
   transaction={...transaction,commit:head};writeState(transaction);
  }
 }else{
  if(head!==expectedLocal)throw Error('Local branch changed before publication');
  if(git(['diff','--cached','--name-only']))throw Error('Unrelated staged changes must be preserved');
 }
 const net=(command)=>retryGit(()=>{
  if(git(['rev-parse','HEAD'])!==(transaction?.commit||transaction?.base||expectedLocal))throw Error('Local branch changed during publication retry');
  return git(command);
 },{signal,onRetry,wait,operationName:command[0]});
 await net(['fetch','origin',BRANCH]);
 const remote=git(['rev-parse','FETCH_HEAD']);
 if(transaction?.commit&&remote===transaction.commit){writeState({...transaction,phase:'published',publishedAt:new Date().toISOString()});return transaction.commit;}
 if(remote!==(transaction?.base||expectedLocal))throw Error('Remote branch changed; reconcile without force push');
 if(!transaction){transaction={id:randomUUID(),path,base:expectedLocal,phase:'pending',createdAt:new Date().toISOString()};writeState(transaction);}
 if(!transaction.commit){
  if(!scoped(git(['diff','--cached','--name-only']),path))throw Error('Unrelated staged changes must be preserved');
  git(['add','--',path]);const staged=git(['diff','--cached','--name-only']);
  if(!scoped(staged,path))throw Error('Checkpoint includes unrelated staged files');
  if(!staged){writeState({...transaction,phase:'published',commit:transaction.base});return transaction.base;}
  git(['commit','-m','Checkpoint eGranthalaya audit [skip ci] [skip vercel]\n\nAudit-publication-id: '+transaction.id]);
  transaction={...transaction,commit:git(['rev-parse','HEAD'])};writeState(transaction);
 }
 // Retrying this exact normal push is safe even if the first acknowledgement was lost.
 await net(['push','origin','HEAD:refs/heads/'+BRANCH]);
 writeState({...transaction,phase:'published',publishedAt:new Date().toISOString()});return transaction.commit;
}
