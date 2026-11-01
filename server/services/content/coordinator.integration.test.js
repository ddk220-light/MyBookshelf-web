import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createRedisCoordinator } from './coordinator.js';
import {redisTestCommand} from '../../../tools/content/redis-test-command.mjs';

test('actual Redis atomically coordinates two instances, coalescing, quotas and failed-store dispatch',
  {skip:!process.env.CONTENT_REDIS_TEST_CONTAINER&&'Set CONTENT_REDIS_TEST_CONTAINER to a disposable local Redis container'},async t=>{
    const container=process.env.CONTENT_REDIS_TEST_CONTAINER;
    if(!/^mybookshelf-free-content-test-[a-z0-9-]+$/.test(container))throw Error('REFUSING_NONTEST_CONTAINER');
    const server=createServer(async(req,res)=>{
      try{
        let raw='';for await(const chunk of req)raw+=chunk;
        const result=await redisTestCommand(container,JSON.parse(raw));
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify({result}));
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
    // Pacing is source-wide across two instances, even when each request is a
    // different page. Cached pages remain available during the spacing window.
    let arxivCalls=0;
    await a.run('arxiv','e'.repeat(64),policy,async()=>{arxivCalls++;return{items:[]};});
    assert.equal((await b.run('arxiv','f'.repeat(64),policy,async()=>{arxivCalls++;})).status,'queued');
    assert.equal((await b.run('arxiv','e'.repeat(64),policy,async()=>{arxivCalls++;})).cached,true);
    assert.equal(arxivCalls,1);
    await new Promise(resolve=>setTimeout(resolve,3050));
    assert.equal((await b.run('arxiv','f'.repeat(64),policy,async()=>{arxivCalls++;return{items:[]};})).status,'ok');
    assert.equal(arxivCalls,2);
    let doajCalls=0;
    await assert.rejects(a.run('doaj','1'.repeat(64),policy,async()=>{doajCalls++;throw Object.assign(Error('429'),{sourceStatus:'throttled',retryAfterSeconds:2});}));
    assert.equal((await b.run('doaj','2'.repeat(64),policy,async()=>{doajCalls++;})).status,'throttled');
    assert.equal(doajCalls,1);
    const large={items:[],fixturePadding:'x'.repeat(180000)};
    await a.run('sessions','3'.repeat(64),policy,async()=>large);
    assert.deepEqual(await b.get('sessions','3'.repeat(64)),large);
    await a.cache('arxiv',[{key:'4'.repeat(64),value:{key:'fcd:v1:arxiv:2601.12345v2'}}]);
    assert.deepEqual(await b.get('arxiv','4'.repeat(64)),{key:'fcd:v1:arxiv:2601.12345v2'});
    const broken=createRedisCoordinator({...options,fetchImpl:async()=>{throw Error('connection failed');}});
    await assert.rejects(broken.run('europepmc','d'.repeat(64),policy,async()=>{calls++;}),/unavailable/);
    assert.equal(calls,1);
  });

test('coordinator is absent without credentials and rejects unsafe configuration',()=>{
  assert.equal(createRedisCoordinator({url:undefined,token:undefined}),null);
  assert.throws(()=>createRedisCoordinator({url:'http://public.example.org',token:'x'}));
  assert.throws(()=>createRedisCoordinator({url:'https://user:secret@example.org',token:'x'}));
});
