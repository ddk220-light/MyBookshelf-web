// Per-instance guards for catalog hosts (plan 5.4). Request caps, deadlines
// and pacing inside one lookup are enforced by providers/http.js
// (`withCatalogOperation`); this module limits lookups across readers.
//
// - Circuit: three failures for a host within 10 minutes open a 10-minute
//   circuit. While open, result marking skips the host and the book page
//   still tries once.
// - Concurrency: at most `limit` lookups at once per host; a lookup waits for
//   a slot until its deadline, then gives up (couldn't check, never absence).
// - Result marking: at most one marking run per host at a time; a second one
//   is not queued.
//
// Phase 2 adds the cross-instance counter (`host_request_windows`).

export const CIRCUIT_FAILURES = 3;
export const CIRCUIT_WINDOW_MS = 10 * 60 * 1000;
export const CIRCUIT_OPEN_MS = 10 * 60 * 1000;

export function createHostGuard({ now = () => Date.now() } = {}) {
  const failures = new Map();
  const openUntil = new Map();
  const active = new Map();
  const waiting = new Map();
  const marking = new Set();

  function circuitOpen(host) {
    const until = openUntil.get(host);
    if (until == null) return false;
    if (until > now()) return true;
    openUntil.delete(host);
    return false;
  }

  function recordFailure(host) {
    const at = now();
    const recent = (failures.get(host) || []).filter(time => at - time < CIRCUIT_WINDOW_MS);
    recent.push(at);
    failures.set(host, recent);
    if (recent.length >= CIRCUIT_FAILURES) {
      openUntil.set(host, at + CIRCUIT_OPEN_MS);
      failures.delete(host);
    }
    if (failures.size > 5_000) failures.delete(failures.keys().next().value);
  }

  function recordSuccess(host) {
    failures.delete(host);
    openUntil.delete(host);
  }

  function release(host) {
    const queue = waiting.get(host);
    const next = queue?.shift();
    if (!queue?.length) waiting.delete(host);
    if (next) { next(); return; }
    const count = (active.get(host) || 1) - 1;
    if (count > 0) active.set(host, count); else active.delete(host);
  }

  // Resolves to a release function, or rejects when the deadline passes or
  // the signal aborts before a slot frees up.
  function acquire(host, limit, { deadlineAt = Infinity, signal } = {}) {
    if (signal?.aborted) return Promise.reject(Object.assign(new Error('Catalog check was cancelled'), { code: 'CATALOG_ABORTED' }));
    const count = active.get(host) || 0;
    let released = false;
    const handle = () => { if (!released) { released = true; release(host); } };
    if (count < Math.max(1, limit)) {
      active.set(host, count + 1);
      return Promise.resolve(handle);
    }
    return new Promise((resolve, reject) => {
      let timer;
      const grant = () => { clearTimeout(timer); signal?.removeEventListener?.('abort', abort); resolve(handle); };
      const drop = error => {
        const queue = waiting.get(host) || [];
        const index = queue.indexOf(grant);
        if (index >= 0) queue.splice(index, 1);
        if (!queue.length) waiting.delete(host);
        reject(error);
      };
      const abort = () => { clearTimeout(timer); drop(Object.assign(new Error('Catalog check was cancelled'), { code: 'CATALOG_ABORTED' })); };
      if (Number.isFinite(deadlineAt)) {
        timer = setTimeout(() => {
          signal?.removeEventListener?.('abort', abort);
          drop(Object.assign(new Error('Waited too long for this catalog'), { code: 'CATALOG_TIMEOUT' }));
        }, Math.max(0, deadlineAt - now()));
      }
      signal?.addEventListener?.('abort', abort, { once: true });
      const queue = waiting.get(host) || [];
      queue.push(grant);
      waiting.set(host, queue);
    });
  }

  function tryStartMarking(host) {
    if (marking.has(host)) return null;
    marking.add(host);
    let done = false;
    return () => { if (!done) { done = true; marking.delete(host); } };
  }

  return Object.freeze({ circuitOpen, recordFailure, recordSuccess, acquire, tryStartMarking,
    activeCount: host => active.get(host) || 0 });
}
