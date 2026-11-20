import http from 'node:http';
import https from 'node:https';
import { constants as cryptoConstants } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { catalogAgent, catalogDispatcher } from './network.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 60_000;
const USER_AGENT = 'MyBookshelf/1.0 (web; +https://mybookshelf.cloud/privacy)';
const MAX_CACHE_ENTRIES = 512;
const MAX_QUEUE_DEPTH = 50;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

// lane -> { active, waiting } (enqueueTask)
const queues = new Map();
const operations = new AsyncLocalStorage();

// One reader-visible operation (an availability check, a catalog search or a
// record read) can declare a hard upstream request budget, and a host can ask
// for spacing between successive requests (robots.txt Crawl-Delay). Both are
// scoped to the operation, so one reader's check never waits on another's.
// Nested operations reuse the outermost budget and pacing.
//
// The catalog lookup layer also passes:
// - `signal`: once aborted, no further request is scheduled and an in-flight
//   request is cancelled (a request already answered cannot be recalled);
// - `minIntervalMs`: spacing between successive requests to one host within
//   the operation (the larger of this and the adapter's own value applies);
// - `robots`: an async `(url) => ({ allowed, delayMs })` policy check run before
//   each request; a disallowed path is refused without contacting the host.
// - `gate`: an async `(host, { spacingMs, deadlineAt, signal })` check run
//   before each request, after robots and this operation's own pacing. It
//   enforces per-host spacing (Crawl-delay) and per-minute caps across every
//   reader (catalog-store/hostGate.js); it waits for the host's next slot or
//   throws when that slot is past the deadline.
// - `noRetries`: every request is sent once, with no transport retry (used
//   while a host's circuit is open: the book page tries once).
// - `requestTimeoutMs`: no single request of the operation waits longer than
//   this (a book check: 30 s of its 45 s, catalog-lookup/platforms.js), so
//   one slow request cannot use up a check that needs several.
// - `deadlineAt`: when the whole operation must end (a book check's
//   deadline). Adapters whose own call deadline would be shorter use it
//   instead (providers/koha.js), so the check, not the call, sets the limit.
// - `hostRequests`: how many of this operation's requests may be waiting on
//   one host at once on this instance (default 1; a book check is one
//   search since 20 November 2026 and leaves it at 1). The host gate paces
//   when each request starts, across every reader.
//
// A reader's book check has no request cap (owner decision, 20 November
// 2026): its deadline and the shared host pacing bound it. Result marking and
// other work the app does on its own keeps a cap.
//
// Requests connect with the catalog connection settings in network.js (a 2.5 s
// attempt per address). A caller that is not reading a library catalog, such
// as the Open Library metadata reads, passes `catalogConnection: false` and
// gets Node's defaults. A caller's own `dispatcher` (KALNET) is used as given.
export function withCatalogOperation({ maxRequests = Infinity, signal = null, minIntervalMs = 0, robots = null, gate = null, noRetries = false, requestTimeoutMs = Infinity, deadlineAt = null, hostRequests = 1 } = {}, task) {
  const current = operations.getStore();
  if (current) return task(current);
  const store = { maxRequests, requests: 0, lastByHost: new Map(), signal, minIntervalMs, robots, gate, noRetries, requestTimeoutMs, deadlineAt,
    hostRequests: Math.max(1, Math.min(4, Math.floor(hostRequests) || 1)) };
  return operations.run(store, () => task(store));
}

// An explicit route scope adds its own cap without replacing the reader's
// aggregate budget. Ordinary nested withCatalogOperation calls still reuse
// their current scope. Cancelling one route does not cancel sibling fallbacks.
// A supplied gate replaces the inherited gate so one request reserves one host
// slot; that route gate must retain the outer operation's deadline restriction.
export function withCatalogSuboperation(options = {}, task) {
  const parent = operations.getStore();
  if (!parent) return withCatalogOperation(options, task);
  const signals = [...new Set([parent.signal, options.signal].filter(Boolean))];
  const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0] || null;
  let robots = parent.robots;
  if (options.robots && options.robots !== robots) {
    const inherited = robots;
    robots = inherited ? async url => {
      const outer = await inherited(url);
      if (!outer?.allowed) return outer;
      const inner = await options.robots(url);
      return { allowed: Boolean(inner?.allowed), delayMs: Math.max(outer.delayMs || 0, inner?.delayMs || 0) };
    } : options.robots;
  }
  const store = {
    parent, maxRequests: options.maxRequests ?? Infinity, requests: 0,
    lastByHost: parent.lastByHost, signal, robots,
    gate: options.gate ?? parent.gate,
    minIntervalMs: Math.max(parent.minIntervalMs || 0, options.minIntervalMs || 0),
    noRetries: Boolean(parent.noRetries || options.noRetries),
    requestTimeoutMs: Math.min(parent.requestTimeoutMs ?? Infinity, options.requestTimeoutMs ?? Infinity),
    deadlineAt: [parent.deadlineAt, options.deadlineAt].filter(Number.isFinite).reduce((a, b) => Math.min(a, b), Infinity),
    hostRequests: Math.max(1, Math.min(parent.hostRequests || 1, options.hostRequests || parent.hostRequests || 1)),
  };
  return operations.run(store, () => task(store));
}

function abortedError() {
  return Object.assign(new Error('Catalog operation was cancelled'), { name: 'AbortError', code: 'CATALOG_ABORTED' });
}

function robotsError() {
  return Object.assign(new Error('The catalog’s robots rules do not allow this request'), { code: 'CATALOG_PROVIDER_BLOCKED', robots: true });
}

export function catalogOperation() {
  return operations.getStore() || null;
}

function budgetError() {
  return Object.assign(new Error('Catalog request budget exhausted'), { code: 'CATALOG_REQUEST_BUDGET' });
}

function checkRequestBudgets(operation) {
  for (let scope = operation; scope; scope = scope.parent) {
    if (scope.requests >= scope.maxRequests) throw budgetError();
  }
}

function countRequest(operation) {
  for (let scope = operation; scope; scope = scope.parent) scope.requests += 1;
}

const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms); });

async function paceRequest(operation, host, minIntervalMs, deadlineAt) {
  if (!operation || !(minIntervalMs > 0)) return;
  const last = operation.lastByHost.get(host);
  if (last == null) return;
  const wait = last + minIntervalMs - Date.now();
  if (wait <= 0) return;
  // Waiting past the caller's deadline would only produce a late failure.
  if (deadlineAt != null && Date.now() + wait >= deadlineAt) throw deadlineError();
  await sleep(wait);
}
const queueDepth = new Map();
const cache = new Map();
const inFlight = new Map();

function hostOf(url) {
  return new URL(url).host;
}

function remaining(deadlineAt, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return deadlineAt == null ? timeoutMs : Math.max(0, deadlineAt - Date.now());
}

function deadlineError() {
  const error = new Error('request deadline exceeded');
  error.name = 'AbortError';
  return error;
}

function raceDeadline(promise, deadlineAt) {
  if (deadlineAt == null) return promise;
  const wait = remaining(deadlineAt);
  if (wait === 0) {
    // The task may already be scheduled. Consume its eventual rejection even
    // though the caller's deadline has elapsed, just as Promise.race does.
    promise.catch(() => {});
    return Promise.reject(deadlineError());
  }
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(deadlineError()), wait); }),
  ]).finally(() => clearTimeout(timer));
}

// Starts waiting tasks in order while the first one's own limit allows.
function pumpLane(lane, state) {
  while (state.waiting.length && state.active < state.waiting[0].limit) {
    const next = state.waiting.shift();
    state.active += 1;
    next();
  }
  if (!state.active && !state.waiting.length && queues.get(lane) === state) queues.delete(lane);
}

// Runs `task` in `lane` (first come, first served). By default one task of a
// lane runs at a time; `concurrency` lets this task start while fewer than
// that many tasks of the lane are running (an HTTP host lane allows a reader's
// check two requests at once on catalogs that answer plain GET searches).
export function enqueueTask(lane, task, { deadlineAt, concurrency = 1 } = {}) {
  const depth = queueDepth.get(lane) || 0;
  if (depth >= MAX_QUEUE_DEPTH) return Promise.reject(new Error('provider queue is full'));
  queueDepth.set(lane, depth + 1);
  let state = queues.get(lane);
  if (!state) queues.set(lane, state = { active: 0, waiting: [] });
  const current = new Promise((resolve, reject) => {
    const start = () => {
      Promise.resolve().then(() => {
        if (deadlineAt != null && remaining(deadlineAt) === 0) throw deadlineError();
        return task();
      }).then(resolve, reject).finally(() => {
        state.active -= 1;
        pumpLane(lane, state);
      });
    };
    start.limit = Math.max(1, Math.floor(concurrency) || 1);
    state.waiting.push(start);
    pumpLane(lane, state);
  });
  current.finally(() => {
    queueDepth.set(lane, Math.max(0, (queueDepth.get(lane) || 1) - 1));
  }).catch(() => {});
  return raceDeadline(current, deadlineAt);
}

function cachedValue(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  // Refresh insertion order for simple LRU eviction.
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

// Internal readers can plan bounded follow-up work from completed observations.
// This does not start a task or expose the cache through an HTTP endpoint.
export function peekCachedTask(key) {
  return cachedValue(key);
}

function setCachedValue(key, value, ttlMs) {
  cache.delete(key);
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
}

export async function cachedTask(key, task, options = {}) {
  const { ttlMs = CACHE_TTL_MS, deadlineAt, shouldCache = () => true } = options;
  const hit = cachedValue(key);
  if (hit !== undefined) return hit;
  const shared = inFlight.get(key);
  if (shared) {
    try {
      return await raceDeadline(shared.promise, deadlineAt);
    } catch (error) {
      // The reader who started the shared task left or hit its own deadline,
      // which cancelled the shared request. That says nothing about this
      // reader's check: run it again under this reader's own operation.
      const own = operations.getStore()?.signal;
      if (!shared.signal?.aborted || own?.aborted || (deadlineAt != null && remaining(deadlineAt) === 0)) throw error;
      if (inFlight.get(key) === shared) inFlight.delete(key);
      return cachedTask(key, task, options);
    }
  }
  const entry = { promise: Promise.resolve().then(task), signal: operations.getStore()?.signal || null };
  inFlight.set(key, entry);
  try {
    const value = await raceDeadline(entry.promise, deadlineAt);
    if (shouldCache(value)) setCachedValue(key, value, ttlMs);
    return value;
  } finally {
    if (inFlight.get(key) === entry) inFlight.delete(key);
  }
}

function legacyHttpsRequest(url, options, timeoutMs, redirects = 0, originalHost = hostOf(url)) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const requestModule = parsed.protocol === 'https:' ? https : http;
    const request = requestModule.request(parsed, {
      method: options.method || 'GET',
      headers: options.headers,
      signal: options.signal,
      ...(options.catalogConnection ? { agent: catalogAgent(parsed.protocol) } : {}),
      secureOptions: cryptoConstants.SSL_OP_LEGACY_SERVER_CONNECT,
    }, (response) => {
      const chunks = [];
      let byteCount = 0;
      response.on('data', (chunk) => {
        byteCount += chunk.length;
        if (byteCount > MAX_RESPONSE_BYTES) {
          response.destroy(new Error('response body too large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', async () => {
        const text = Buffer.concat(chunks).toString();
        const location = response.headers.location;
        const shouldFollow = options.redirect !== 'manual' && location
          && response.statusCode >= 300 && response.statusCode < 400 && redirects < 5;
        if (shouldFollow) {
          try {
            const next = new URL(location, url);
            if (next.host !== originalHost) throw new Error('cross-host redirect rejected');
            resolve(await legacyHttpsRequest(next.toString(), options, timeoutMs, redirects + 1, originalHost));
          } catch (error) { reject(error); }
          return;
        }
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          headers: new Headers(response.headers),
          url,
          text,
        });
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('request timeout')));
    request.on('error', reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

export function clearHttpCache() {
  cache.clear();
  inFlight.clear();
}

async function readResponseBody(response, maxResponseBytes) {
  if (!response.body?.getReader) return typeof response.text === 'function' ? response.text() : response.text;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxResponseBytes) {
      await reader.cancel('response body too large');
      throw new Error('response body too large');
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function retryableError(error) {
  return !/response body too large|unsupported URL protocol/i.test(error?.message || '');
}

// Retry only idempotent upstream reads by default. The original deadline is
// shared by every attempt, so retries cannot turn into an unbounded wait.
export async function request(url, options = {}) {
  const configuredRetries = operations.getStore()?.noRetries ? 0 : options.retries;
  const method = String(options.method || 'GET').toUpperCase();
  const retries = Number.isInteger(configuredRetries)
    ? Math.max(0, Math.min(configuredRetries, 2))
    : (method === 'GET' ? 1 : 0);
  const { retries: _ignoredRetries, ...withoutRetries } = options;
  const requestOptions = {
    ...withoutRetries,
    deadlineAt: withoutRetries.deadlineAt ?? Date.now() + (withoutRetries.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  };
  let attempt = 0;
  const signal = operations.getStore()?.signal;
  while (true) {
    try {
      const response = await requestOnce(url, requestOptions);
      if (response.ok || response.status < 500 || attempt >= retries || signal?.aborted) return response;
    } catch (error) {
      if (attempt >= retries || !retryableError(error) || signal?.aborted) throw error;
    }
    attempt += 1;
  }
}

async function requestOnce(url, options = {}) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported URL protocol');
  const {
    cacheKey,
    cacheTtlMs = CACHE_TTL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    deadlineAt = Date.now() + timeoutMs,
    maxResponseBytes = MAX_RESPONSE_BYTES,
    minIntervalMs,
    catalogConnection = true,
    ...fetchOptions
  } = options;
  if (cacheKey) {
    const hit = cachedValue(cacheKey);
    if (hit !== undefined) return hit;
  }
  const operation = operations.getStore();
  let spacing = minIntervalMs;
  if (operation) {
    if (operation.signal?.aborted) throw abortedError();
    checkRequestBudgets(operation);
    if (operation.robots) {
      const policy = await operation.robots(url);
      if (!policy?.allowed) throw robotsError();
      spacing = Math.max(spacing || 0, policy.delayMs || 0);
    }
    spacing = Math.max(spacing || 0, operation.minIntervalMs || 0);
    await paceRequest(operation, hostOf(url), spacing, deadlineAt);
    if (operation.signal?.aborted) throw abortedError();
    checkRequestBudgets(operation);
    if (operation.gate) {
      await operation.gate(hostOf(url), { spacingMs: spacing || 0, deadlineAt, signal: operation.signal });
      if (operation.signal?.aborted) throw abortedError();
      checkRequestBudgets(operation);
    }
    countRequest(operation);
  }
  const settled = () => { if (operation && spacing > 0) operation.lastByHost.set(hostOf(url), Date.now()); };

  return enqueueTask(`http:${hostOf(url)}`, async () => {
    if (cacheKey) {
      const hit = cachedValue(cacheKey);
      if (hit !== undefined) return hit;
    }
    // A cancelled lookup must not reach the catalog after waiting in the queue.
    if (operation?.signal?.aborted) throw abortedError();
    const requestTimeout = Math.min(remaining(deadlineAt, timeoutMs), operation?.requestTimeoutMs ?? Infinity);
    if (requestTimeout === 0) throw deadlineError();
    const headers = { 'User-Agent': USER_AGENT, ...(fetchOptions.headers || {}) };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeout);
    const cancel = () => controller.abort();
    operation?.signal?.addEventListener?.('abort', cancel, { once: true });
    try {
      let response;
      try {
        response = await fetch(url, { ...(catalogConnection ? { dispatcher: catalogDispatcher() } : {}), ...fetchOptions, headers, signal: controller.signal });
      } catch (error) {
        const errorText = `${error.code || ''} ${error.message || ''} ${error.cause?.code || ''} ${error.cause?.message || ''}`;
        if (parsed.protocol !== 'https:' || !errorText.match(/LEGACY_RENEGOTIATION|unsafe legacy renegotiation/i)) throw error;
        response = await legacyHttpsRequest(url, { ...fetchOptions, catalogConnection, headers, signal: controller.signal }, requestTimeout);
      }
      let text;
      if (typeof response.text === 'function') {
        const declaredLength = Number(response.headers?.get?.('content-length'));
        if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) throw new Error('response body too large');
        text = await readResponseBody(response, maxResponseBytes);
      } else if (typeof response.json === 'function') {
        text = JSON.stringify(await response.json());
      } else {
        text = response.text;
      }
      if (Buffer.byteLength(text || '') > maxResponseBytes) throw new Error('response body too large');
      const value = { ok: response.ok, status: response.status, headers: response.headers, url: response.url || url, text };
      if (cacheKey && response.ok) setCachedValue(cacheKey, value, cacheTtlMs);
      return value;
    } finally {
      clearTimeout(timer);
      operation?.signal?.removeEventListener?.('abort', cancel);
      settled();
    }
  }, { deadlineAt, concurrency: operation?.hostRequests || 1 });
}

export async function getText(url, options = {}) {
  return request(url, { ...options, headers: { Accept: 'text/html, text/plain, */*', ...(options.headers || {}) } });
}

export async function getJson(url, options = {}) {
  const response = await request(url, { ...options, headers: { Accept: 'application/json', ...(options.headers || {}) } });
  if (!response.ok) return response;
  try {
    return { ...response, json: JSON.parse(response.text) };
  } catch {
    return { ...response, json: null, unreadable: true };
  }
}

export { DEFAULT_TIMEOUT_MS, CACHE_TTL_MS, USER_AGENT, MAX_CACHE_ENTRIES, MAX_QUEUE_DEPTH, MAX_RESPONSE_BYTES };
