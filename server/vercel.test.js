import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import app from './vercel.js';

test('Vercel entrypoint serves health and the bundled directory without a disk database', async () => {
  const health = await request(app).get('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');

  const result = await request(app).post('/api/v2/libraries/search').send({ query: 'Chennai' });
  assert.equal(result.status, 200);
  assert.ok(result.body.libraries.some((library) => library.name === 'Anna Centenary Library'));
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(result.headers['set-cookie'], undefined);
});

test('Vercel entrypoint preserves public API validation and retired-route boundaries', async () => {
  const invalid = await request(app).post('/api/v2/libraries/search').send({ query: '' });
  assert.equal(invalid.status, 400);
  for (const path of ['/api/auth/login', '/api/bookshelf', '/uploads/old.jpg']) {
    const response = await request(app).post(path).send({});
    assert.equal(response.status, 410);
    assert.equal(response.body.error.code, 'LEGACY_API_RETIRED');
  }
  const missing = await request(app).get('/api/v2/missing');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, 'NOT_FOUND');
});
