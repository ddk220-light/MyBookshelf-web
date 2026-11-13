// Per-host request pacing across readers (plan 5.4, "Across instances").
//
// Each catalog request asks the gate for a slot on its host before it is
// sent. A slot respects two limits:
//   - spacing: at least `spacingMs` between requests to the host from any
//     reader (a robots Crawl-delay, e.g. Visakhapatnam's 20 s, or the
//     platform's own spacing);
//   - perMinute: at most this many requests to the host per clock minute.
// The gate waits for the slot, or throws CATALOG_HOST_BUSY when the slot is
// past the caller's deadline. A busy host is our own pacing, not a catalog
// failure: it neither opens the circuit nor counts in the health record.
//
// The database gate (host_request_slots, host_request_windows) holds across
// function instances. Each call has a 300 ms timeout and fails open to this
// instance's memory gate, so a slow or missing store never blocks a lookup
// (plan section 9, item 12).

const MINUTE = 60_000;
const busy = () => Object.assign(new Error('This catalog is busy; try again shortly'), { code: 'CATALOG_HOST_BUSY' });
const aborted = () => Object.assign(new Error('Catalog check was cancelled'), { name: 'AbortError', code: 'CATALOG_ABORTED' });

function sleep(ms, signal) {
  if (!(ms > 0)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(aborted());
    const onAbort = () => { clearTimeout(timer); reject(aborted()); };
    const timer = setTimeout(() => { signal?.removeEventListener?.('abort', onAbort); resolve(); }, ms);
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

export function createMemoryHostGate({ now = () => Date.now(), wait = sleep, maxHosts = 5_000 } = {}) {
  const hosts = new Map();
  function stateFor(host) {
    let state = hosts.get(host);
    if (!state) {
      state = { nextAt: 0, windowStart: 0, count: 0 };
      hosts.set(host, state);
      if (hosts.size > maxHosts) hosts.delete(hosts.keys().next().value);
    }
    return state;
  }
  // Reserves the earliest slot that meets both limits and returns its time.
  function reserveSlot(host, { spacingMs = 0, perMinute = 0, deadlineAt = Infinity }) {
    const state = stateFor(host);
    let at = Math.max(now(), state.nextAt);
    if (perMinute > 0) {
      const window = Math.floor(at / MINUTE) * MINUTE;
      if (window === state.windowStart && state.count >= perMinute) at = window + MINUTE;
    }
    if (at > deadlineAt) throw busy();
    const window = Math.floor(at / MINUTE) * MINUTE;
    if (window !== state.windowStart) { state.windowStart = window; state.count = 0; }
    state.count += 1;
    state.nextAt = spacingMs > 0 ? at + spacingMs : Math.max(state.nextAt, at);
    return at;
  }
  return Object.freeze({
    reserveSlot,
    async reserve(host, options = {}) {
      if (!(options.spacingMs > 0) && !(options.perMinute > 0)) return;
      const at = reserveSlot(host, options);
      await wait(at - now(), options.signal);
    },
  });
}

// Slot spacing in one statement: the next free slot moves forward by the
// spacing only when the slot is within the caller's deadline.
const SLOT = `INSERT INTO host_request_slots AS s (host, next_at) VALUES ($1, now() + make_interval(secs => $2))
  ON CONFLICT (host) DO UPDATE SET next_at = greatest(s.next_at, now()) + make_interval(secs => $2)
  WHERE greatest(s.next_at, now()) <= now() + make_interval(secs => $3)
  RETURNING (extract(epoch FROM s.next_at - make_interval(secs => $2)) * 1000)::bigint AS slot_ms,
    (extract(epoch FROM now()) * 1000)::bigint AS now_ms`;

// Per-minute counter for the minute that holds the slot.
const WINDOW = `INSERT INTO host_request_windows AS w (host, window_start, requests)
  VALUES ($1, date_trunc('minute', to_timestamp($2::double precision / 1000), 'UTC'), 1)
  ON CONFLICT (host, window_start) DO UPDATE SET requests = w.requests + 1 WHERE w.requests < $3
  RETURNING requests`;

export function createPgHostGate(db, { fallback = createMemoryHostGate(), now = () => Date.now(), wait = sleep, timeoutMs = 300 } = {}) {
  async function remote(host, { spacingMs = 0, perMinute = 0, deadlineAt = Infinity, signal }) {
    const remaining = Number.isFinite(deadlineAt) ? Math.max(0, deadlineAt - now()) : 3_600_000;
    let slotAt = now();
    let offset = 0; // database clock minus this instance's clock
    if (spacingMs > 0) {
      const { rows } = await db.query(SLOT, [host, spacingMs / 1000, remaining / 1000], { timeoutMs });
      if (!rows.length) throw busy();
      offset = Number(rows[0].now_ms) - now();
      slotAt = Number(rows[0].slot_ms) - offset;
    }
    if (perMinute > 0) {
      // Try the slot's minute, then the next one if it is within the deadline.
      for (let attempt = 0; ; attempt += 1) {
        const { rows } = await db.query(WINDOW, [host, slotAt + offset, perMinute], { timeoutMs });
        if (rows.length) break;
        const nextMinute = (Math.floor((slotAt + offset) / MINUTE) + 1) * MINUTE - offset;
        if (attempt >= 1 || nextMinute > deadlineAt) throw busy();
        slotAt = nextMinute;
      }
    }
    await wait(slotAt - now(), signal);
  }
  return Object.freeze({
    async reserve(host, options = {}) {
      if (!(options.spacingMs > 0) && !(options.perMinute > 0)) return;
      let reserved = false;
      try {
        await remote(host, options);
        reserved = true;
      } catch (error) {
        if (['CATALOG_HOST_BUSY', 'CATALOG_ABORTED'].includes(error?.code)) throw error;
        // Store slow or down: this instance's limits still apply.
      }
      if (!reserved) await fallback.reserve(host, options);
    },
  });
}
