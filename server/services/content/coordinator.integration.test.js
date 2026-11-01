import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createRedisCoordinator } from './coordinator.js';
const exec=promisify(execFile);

test('actual Redis atomically coordinates two instances, coalescing, quotas and failed-store dispatch',
  {skip:!process.env.CONTENT_REDIS_TEST_CONTAINER&&'Set CONTENT_REDIS_TEST_CONTAINER to a disposable local Redis container'},async t=>{
    const container=process.env.CONTENT_REDIS_TEST_CONTAINER;
    if(!/^mybookshelf-free-content-test-[a-z0-9-]+$/.test(container))throw Error('REFUSING_NONTEST_CONTAINER');
    const server=createServer(async(req,res)=>{
      try{
        let raw='';for await(const chunk of req)raw+=chunk;
        const args=JSON.parse(raw).map(String);
        const {stdout}=await exec('docker',['exec',container,'redis-cli','--json',...args],{maxBuffer:4*1024*1024});
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify({result:JSON.parse(stdout)}));
      }catch{res.statusCode=500;res.end('{}');}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    t.after(()=>new Promise(resolve=>server.close(resolve)));
    const options={url:`http://127.0.0.1:${server.address().port}`,token:'synthetic-test-token',allowInsecureLocal:true,namespace:'test:'+randomUUID()};
    const a=createRedisCoordinator(options),b=createRedisCoordinator(options);
    const policy={dailyLimit:2,perMinute:100,concurrency:2};
    const key='a'.repeat(64);let calls=0,release;
    const ready=new Promise(resolve=>{release=resolve;});
    let started;const begin=new Promise(resolve=>{started=resolve;});
    const first=a.run('europepmc',key,policy,async()=>{calls++;started();await ready;return {items:[],nextSourceCursor:'next'};});
    await begin;
    assert.equal((await b.run('europepmc',key,policy,async()=>{calls++;})).status,'queued');
    release();await first;
    const replay=await b.run('europepmc',key,policy,async()=>{calls++;});
    assert.equal(replay.cached,true);assert.equal(calls,1);
    assert.deepEqual(await b.get('europepmc',key),{items:[],nextSourceCursor:'next'});
    await a.run('europepmc','b'.repeat(64),policy,async()=>({items:[]}));
    assert.equal((await b.run('europepmc','c'.repeat(64),policy,async()=>{calls++;})).status,'quota_exhausted');
    assert.equal(calls,1);
    const broken=createRedisCoordinator({...options,fetchImpl:async()=>{throw Error('connection failed');}});
    await assert.rejects(broken.run('europepmc','d'.repeat(64),policy,async()=>{calls++;}),/unavailable/);
    assert.equal(calls,1);
  });

test('coordinator is absent without credentials and rejects unsafe configuration',()=>{
  assert.equal(createRedisCoordinator({url:undefined,token:undefined}),null);
  assert.throws(()=>createRedisCoordinator({url:'http://public.example.org',token:'x'}));
  assert.throws(()=>createRedisCoordinator({url:'https://user:secret@example.org',token:'x'}));
});
