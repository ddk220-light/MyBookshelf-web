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
