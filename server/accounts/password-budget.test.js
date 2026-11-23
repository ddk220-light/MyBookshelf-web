import test from 'node:test';
import assert from 'node:assert/strict';
import {createPasswordBudget} from '../auth/password-budget.js';
test('password work applies bounded backpressure, expires waiting jobs, and recovers capacity',async()=>{
 const budget=createPasswordBudget({concurrency:1,queueLimit:1,timeoutMs:25});let release;
 const active=budget.run(()=>new Promise(resolve=>{release=resolve;}));let ran=false;
 const queued=assert.rejects(budget.run(async()=>{ran=true;}),e=>e.code==='PASSWORD_BUSY');
 await assert.rejects(budget.run(async()=>{}),e=>e.code==='PASSWORD_BUSY');
 await queued;assert.equal(ran,false);release();await active;
 assert.equal(await budget.run(async()=>42),42);
});
