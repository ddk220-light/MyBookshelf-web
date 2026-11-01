import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createAnonymousApp } from '../anonymousApp.js';
import { createPublicV2Router } from './router.js';

test('content errors stay distinct from circulation errors and preserve public headers', async () => {
  const content={search:()=>{throw Object.assign(Error('The content request is invalid.'),{code:'CONTENT_INVALID_REQUEST'});},resolve:()=>{throw Error('internal secret');}};
  const app=createAnonymousApp({publicRouter:createPublicV2Router({content})});
  const invalid=await request(app).post('/api/v2/content/search').send({query:'x'});
  assert.equal(invalid.status,400);
  assert.equal(invalid.body.error.code,'CONTENT_INVALID_REQUEST');
  const unavailable=await request(app).post('/api/v2/content/resolve').send({key:'x'});
  assert.equal(unavailable.status,503);
  assert.equal(unavailable.body.error.code,'CONTENT_UNAVAILABLE');
  assert.ok(!unavailable.text.includes('internal secret'));
  assert.equal(unavailable.headers['cache-control'],'no-store');
  assert.equal(unavailable.headers['set-cookie'],undefined);
  assert.equal((await request(app).post('/api/v2/libraries/search').send({query:'Chennai'})).status,200);
});

test('streaming source progress ends with one committed result or an explicit error, preserving no-store',async()=>{
  let fail=false;
  const content={search:async(_input,{onSource})=>{
    onSource({id:'doaj',status:'searching',returned:0});
    if(fail)throw Object.assign(Error('The source timed out.'),{code:'CONTENT_UNAVAILABLE',status:503,sources:[{id:'doaj',status:'timeout',returned:0}]});
    onSource({id:'doaj',status:'ok',returned:0});return {items:[],sources:[{id:'doaj',status:'ok',returned:0}]};
  }};
  const app=createAnonymousApp({publicRouter:createPublicV2Router({content})});
  const success=await request(app).post('/api/v2/content/search').set('Accept','application/x-ndjson').send({query:'fixture'});
  assert.match(success.headers['content-type'],/application\/x-ndjson/);assert.equal(success.headers['cache-control'],'no-store');
  const events=success.text.trim().split('\n').map(line=>JSON.parse(line));
  assert.deepEqual(events.map(e=>e.type),['source','source','result']);assert.deepEqual(events[2].result.items,[]);
  fail=true;
  const failure=await request(app).post('/api/v2/content/search').set('Accept','application/x-ndjson').send({query:'fixture'});
  const failed=failure.text.trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(failed[1].type,'error');assert.equal(failed[1].status,503);assert.equal(failed[1].sources[0].status,'timeout');
  assert.equal(failed.some(e=>e.type==='result'),false);
});
