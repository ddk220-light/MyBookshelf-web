import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import { csrfForSession, requireMutation, requestIP, safeReturnPath } from './security.js';

const config = { baseURL: 'https://accounts.example.test', secret: 'only-a-synthetic-test-secret' };

test('custom writes require the active session, exact origin, JSON and session-bound CSRF', async () => {
  const identity = { status: 'authenticated', sessionId: 'synthetic-session-A' };
  const app = express();
  app.post('/write', express.json(), (req, res) => {
    try { requireMutation(req, identity, config); res.json({ confirmed: true }); }
    catch (error) { res.status(error.status).json({ code: error.code }); }
  });
  assert.equal((await request(app).post('/write').send({})).status, 403);
  assert.equal((await request(app).post('/write').set('Origin', config.baseURL).send({})).body.code, 'CSRF_REJECTED');
  const fromOtherSession = csrfForSession(config.secret, 'synthetic-session-B');
  assert.equal((await request(app).post('/write').set('Origin', config.baseURL).set('X-Account-CSRF', fromOtherSession).send({})).status, 403);
  const valid = csrfForSession(config.secret, identity.sessionId);
  assert.equal((await request(app).post('/write').set('Origin', 'https://attacker.test').set('X-Account-CSRF', valid).send({})).status, 403);
  assert.equal((await request(app).post('/write').set('Origin', config.baseURL).set('X-Account-CSRF', valid).send({})).status, 200);
});

test('return destinations reject outside origins, traversal, control characters and auth loops while preserving book keys', () => {
  for (const value of ['https://attacker.test', '//attacker.test', '/app/../outside', '/app/%2e%2e/outside', '/app/%252e%252e/outside', '/app/\\attacker', '/app/book/%0aheader', '/app/account/sign-in', '/app/%61ccount/sign-in', '/app/book/%broken']) {
    assert.equal(safeReturnPath(value), '/app/shelf', value);
  }
  assert.equal(safeReturnPath('/app/book/ol%3A%2Fworks%2FOL123W?tab=editions'), '/app/book/ol%3A%2Fworks%2FOL123W?tab=editions');
  assert.equal(safeReturnPath('/app/settings/account'), '/app/settings/account');
});

test('forwarded IP headers are ignored off Vercel and bounded on its trusted edge', () => {
  const req = { socket: { remoteAddress: '127.0.0.1' }, get: () => '203.0.113.7' };
  assert.equal(requestIP(req, {}), '127.0.0.1');
  assert.equal(requestIP(req, { VERCEL: '1' }), '203.0.113.7');
  req.get = () => '203.0.113.7, 10.0.0.1';
  assert.equal(requestIP(req, { VERCEL: '1' }), '127.0.0.1');
});
