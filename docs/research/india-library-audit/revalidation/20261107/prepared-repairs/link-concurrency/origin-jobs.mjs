import {setTimeout as delay} from 'node:timers/promises';

// One coordinator still enforces per-origin request gaps, policy and global
// request limits. This scheduler avoids spending request deadlines waiting
// behind another job from the same origin; independent origins can progress.
export async function runOriginJobs(jobs,{concurrency=3,originFor,run,signal}={}) {
  if(!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>8)throw Error('Invalid job concurrency');
  const pending=jobs.map(job=>({job,origin:originFor(job)})),busy=new Set();let failure;
  async function worker(){
    while(pending.length&&!signal?.aborted&&!failure){
      const index=pending.findIndex(entry=>!busy.has(entry.origin));
      if(index<0){await delay(10);continue;}
      const [{job,origin}]=pending.splice(index,1);busy.add(origin);
      try{await run(job);}catch(error){failure ||= error;}finally{busy.delete(origin);}
    }
  }
  await Promise.all(Array.from({length:Math.min(concurrency,jobs.length)},worker));
  if(failure)throw failure;
}
