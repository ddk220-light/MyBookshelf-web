import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { EventEmitter } from 'node:events';

// Captured before any provider module is loaded.
const processDefault = net.getDefaultAutoSelectFamilyAttemptTimeout();
await import('./index.js');
const { AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS, catalogAgent, catalogDispatcher } = await import('./network.js');
const { clearHttpCache, getJson, request } = await import('./http.js');
const { defaultFetchPolicy } = await import('./robots.js');
const { kalnetTransportOptions } = await import('./kalnet-tls.js');

const originalFetch = global.fetch;
const originalConnect = { net: net.connect, tls: tls.connect, https: https.request };
afterEach(() => {
  global.fetch = originalFetch;
  net.connect = originalConnect.net;
  tls.connect = originalConnect.tls;
  https.request = originalConnect.https;
  clearHttpCache();
});

// Records the options of every outgoing socket while `task` runs.
async function connectOptions(task) {
  const seen = [];
  net.connect = function connect(...args) { seen.push(args[0]); return originalConnect.net.apply(this, args); };
  tls.connect = function connect(...args) { seen.push(args[0]); return originalConnect.tls.apply(this, args); };
  try { await task(); } finally { net.connect = originalConnect.net; tls.connect = originalConnect.tls; }
  return seen;
}

async function localServer() {
  const server = http.createServer((req, res) => { res.setHeader('Connection', 'close'); res.end(req.url === '/robots.txt' ? 'User-agent: *\nAllow: /\n' : '{}'); });
  await new Promise(resolve => { server.listen(0, '127.0.0.1', resolve); });
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}

test('importing the providers leaves Node\'s process-wide connection attempt default unchanged', () => {
  assert.equal(net.getDefaultAutoSelectFamilyAttemptTimeout(), processDefault);
  assert.notEqual(processDefault, AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS);
  assert.equal(AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS, 2_500);
});

test('catalog requests and robots.txt reads connect with a 2.5 s attempt per address; metadata reads do not', async () => {
  const server = await localServer();
  try {
    const catalog = await connectOptions(() => request(`${server.origin}/catalog`, { retries: 0 }));
    assert.equal(catalog.length, 1);
    assert.equal(catalog[0].autoSelectFamily, true);
    assert.equal(catalog[0].autoSelectFamilyAttemptTimeout, 2_500);

    const robots = await connectOptions(() => defaultFetchPolicy(`${server.origin}/robots.txt`));
    assert.equal(robots.length, 1);
    assert.equal(robots[0].autoSelectFamilyAttemptTimeout, 2_500);

    // Open Library metadata reads opt out and keep Node's defaults.
    const metadata = await connectOptions(() => getJson(`${server.origin}/isbn/x.json`, { retries: 0, catalogConnection: false }));
    assert.equal(metadata.length, 1);
    assert.notEqual(metadata[0].autoSelectFamilyAttemptTimeout, 2_500);
  } finally {
    await server.close();
  }
});

test('the KALNET transport keeps its validated chain and carries the same 2.5 s attempt', async () => {
  const { dispatcher } = kalnetTransportOptions('https://kalnet.kshec.kerala.gov.in/vufind/Search/Results');
  assert.notEqual(dispatcher, catalogDispatcher());
  const server = await localServer();
  try {
    // A plain HTTP listener: the TLS handshake fails, after the socket options are set.
    const seen = await connectOptions(() => dispatcher.request({ origin: server.origin.replace('http:', 'https:'), path: '/', method: 'GET' }).catch(() => {}));
    assert.ok(seen.length >= 1);
    assert.equal(seen[0].autoSelectFamilyAttemptTimeout, 2_500);
    assert.equal(seen[0].rejectUnauthorized, true);
    assert.ok(seen[0].ca.length > 1);
  } finally {
    await server.close();
  }
});

test('the legacy-renegotiation fallback uses catalog agents with the same 2.5 s attempt', async () => {
  for (const protocol of ['http:', 'https:']) {
    assert.equal(catalogAgent(protocol).options.autoSelectFamilyAttemptTimeout, 2_500);
    assert.equal(catalogAgent(protocol).options.autoSelectFamily, true);
    assert.equal(catalogAgent(protocol), catalogAgent(protocol));
  }
  assert.notEqual(http.globalAgent.options.autoSelectFamilyAttemptTimeout, 2_500);
  let fetched, sent;
  global.fetch = async (url, options) => { fetched = options; throw Object.assign(new Error('fetch failed'), { cause: { code: 'ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED' } }); };
  https.request = (url, options) => {
    sent = options;
    const pending = Object.assign(new EventEmitter(), { setTimeout() {}, write() {}, destroy() {}, end() { process.nextTick(() => pending.emit('error', new Error('stopped by test'))); } });
    return pending;
  };
  await assert.rejects(request('https://legacy.example/search', { retries: 0 }), /stopped by test/);
  assert.equal(fetched.dispatcher, catalogDispatcher());
  assert.equal(sent.agent, catalogAgent('https:'));
});
