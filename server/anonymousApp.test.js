import assert from 'node:assert/strict';
import test from 'node:test';
import { Router } from 'express';
import request from 'supertest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createAnonymousApp, LEGACY_API_RETIRED } from './anonymousApp.js';

function app() {
  const publicRouter = Router();
  publicRouter.post('/probe', (req, res) => res.json({ ok: true }));
  return createAnonymousApp({ publicRouter });
}

test('native app policy and support are public documents rather than the web-app fallback', async (t) => {
  const dist = await mkdtemp(path.join(tmpdir(), 'mybookshelf-public-docs-'));
  t.after(() => rm(dist, { recursive: true, force: true }));
  await writeFile(path.join(dist, 'index.html'), '<title>Anonymous web catalog</title>');
  await writeFile(path.join(dist, 'privacy.html'), '<title>Privacy policy · myBookshelf</title>');
  await writeFile(path.join(dist, 'support.html'), '<title>Help &amp; support · myBookshelf</title>');
  const target = createAnonymousApp({ clientDist: dist, publicRouter: Router() });
  for (const [route, title] of [['privacy', 'Privacy policy'], ['support', 'Help &amp; support']]) {
    const response = await request(target).get(`/${route}`).set('Accept', 'text/html');
    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /text\/html/);
    assert.ok(response.text.includes(title));
    assert.ok(!response.text.includes('Anonymous web catalog'));
    assert.equal(response.headers['cache-control'], 'no-cache');
    assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/);
  }
});

test('anonymous app accepts only health and v2 API paths without legacy cookies', async () => {
  const target = app();
  const health = await request(target).get('/api/health').set('Cookie', ['mb_session=old', 'mb_key=old']);
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');
  assert.equal(health.headers['set-cookie'], undefined);

  const v2 = await request(target)
    .post('/api/v2/probe')
    .set('Cookie', ['mb_session=old', 'mb_key=old'])
    .send({ harmless: true });
  assert.equal(v2.status, 200);
  assert.deepEqual(v2.body, { ok: true });
  assert.equal(v2.headers['set-cookie'], undefined);
  assert.equal(v2.headers['access-control-allow-credentials'], undefined);

  const unknownV2 = await request(target).get('/api/v2/not-a-route');
  assert.equal(unknownV2.status, 404);
  assert.equal(unknownV2.body.error.code, 'NOT_FOUND');
  assert.equal(unknownV2.headers['set-cookie'], undefined);
});

test('retired legacy APIs and uploads return a stable denial without reading a session', async () => {
  const target = app();
  for (const path of [
    '/api/auth/login',
    '/api/libraries',
    '/api/debug',
    '/api/scans',
    '/api/books',
    '/api/bookshelf',
    '/api/library/hold',
    '/api/goodreads',
    '/uploads/previous-scan.jpg',
  ]) {
    const response = await request(target)
      .post(path)
      .set('Cookie', ['mb_session=formerly-valid', 'mb_key=formerly-valid'])
      .send({ cardNumber: 'must-not-be-read' });
    assert.equal(response.status, 410, path);
    assert.deepEqual(response.body, LEGACY_API_RETIRED, path);
    assert.equal(response.headers['set-cookie'], undefined, path);
  }
});

test('browser navigation expires legacy cookies but preserves the anonymous API cookie boundary', async () => {
  const response = await request(app())
    .get('/login')
    .set('Accept', 'text/html')
    .set('Cookie', ['mb_session=old', 'mb_key=old']);
  assert.equal(response.status, 404);
  const cookies = response.headers['set-cookie'] || [];
  assert.equal(cookies.length, 2);
  assert.ok(cookies.some((value) => value.startsWith('mb_session=') && /Expires=/.test(value)));
  assert.ok(cookies.some((value) => value.startsWith('mb_key=') && /Expires=/.test(value)));
});
