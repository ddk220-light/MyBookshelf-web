import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAnswer, RECHECK_GROUPS } from './host-recheck.mjs';

test('a refusal, an egress failure and a site error are told apart, and none is empty', () => {
  assert.equal(classifyAnswer({ status: 403, server: 'CloudFront', cache: 'Error from cloudfront' }), 'cdn_refusal');
  assert.equal(classifyAnswer({ status: 403 }), 'refused');
  assert.equal(classifyAnswer({ status: 503, bodyStart: 'upstream connect error or disconnect/reset before headers. retried and the latest reset reason: remote connection failure' }), 'egress_connect_failure');
  assert.equal(classifyAnswer({ status: 503, server: 'nginx', bodyStart: 'Service Unavailable' }), 'server_error');
  assert.equal(classifyAnswer({ error: 'AbortError: This operation was aborted' }), 'timeout');
  assert.equal(classifyAnswer({ error: 'TypeError: fetch failed (ENOTFOUND)' }), 'network_error');
  assert.equal(classifyAnswer({ status: 404 }), 'client_error');
  assert.equal(classifyAnswer({ status: 200 }), 'answered');
});

test('the recheck covers the three unreachable groups and the five single hosts', () => {
  assert.deepEqual(RECHECK_GROUPS.filter((group) => group.prefix).map((group) => group.group), ['KALNET', 'IDEAL', 'Somaiya']);
  assert.equal(RECHECK_GROUPS.length, 8);
});
