// Per-host request pacing across readers (plan 5.4, "Across instances").
//
// Each catalog request asks the gate for a slot on its host before it is
// sent. Slots are paced at an even rate, never in clock-minute windows:
//   - interval: the larger of `spacingMs` (a robots Crawl-delay, e.g.
//     Visakhapatnam's 20 s, or the platform's own spacing) and
//     60 s / `perMinute`;
//   - burst: a host with no fixed spacing may take a few requests (HOST_BURST)
//     back to back before the even rate applies, so one check is not slowed
//     while the host is otherwise quiet. A host with a fixed spacing never
//     bursts: every request keeps that spacing.
// Over any minute a host therefore gets at most `perMinute` requests plus the
// burst. This is a "generic cell rate" schedule: the host keeps one time, the
// next request's theoretical slot, and each reservation moves it on by one
// interval.
//
// Why not clock-minute windows (the first version): with 10 requests a minute
// and checks of 4 to 6 requests, a reader's third check in a minute found the
// window full and the next slot at the start of the next minute, up to 60 s
// away, past the check's 20 s deadline, and was refused at once ("busy") with
// no request sent. An even rate keeps the next slot one interval away, so a
// check waits a second or two for its turn instead.
//
// The gate waits for the slot, or throws CATALOG_HOST_BUSY when the slot is
// past the caller's deadline (many readers queued on one host). A busy host is
// our own pacing, not a catalog failure: it neither opens the circuit nor
// counts in the health record.
//
// The database gate (host_request_slots) holds across function instances.
// Each call has a 300 ms timeout and fails open to this instance's memory
// gate, so a slow or missing store never blocks a lookup (plan section 9,
// item 12). The host_request_windows table of the first version is no longer
// written; maintenance still clears it.

const MINUTE = 60_000;
export const HOST_BURST = 4;
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

// The pacing for one request: the interval between slots and how far ahead of
// the schedule a slot may be taken (the burst allowance), both in ms.
export function pacing({ spacingMs = 0, perMinute = 0 } = {}) {
  const spacing = spacingMs > 0 ? spacingMs : 0;
  const rate = perMinute > 0 ? Math.ceil(MINUTE / perMinute) : 0;
  const intervalMs = Math.max(spacing, rate);
  return { intervalMs, toleranceMs: spacing > 0 ? 0 : (HOST_BURST - 1) * intervalMs };
}

export function createMemoryHostGate({ now = () => Date.now(), wait = sleep, maxHosts = 5_000 } = {}) {
  // host -> the next request's theoretical slot time
  const hosts = new Map();
  // Reserves the earliest slot the pacing allows and returns its time.
  function reserveSlot(host, { spacingMs = 0, perMinute = 0, deadlineAt = Infinity }) {
    const { intervalMs, toleranceMs } = pacing({ spacingMs, perMinute });
    const at = now();
    const next = hosts.get(host) ?? 0;
    const slot = Math.max(at, next - toleranceMs);
    if (slot > deadlineAt) throw busy();
    hosts.delete(host);
    hosts.set(host, Math.max(next, at) + intervalMs);
    if (hosts.size > maxHosts) hosts.delete(hosts.keys().next().value);
    return slot;
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

// One statement: the host's next theoretical slot moves on by one interval,
// only when the slot this request gets (that time less the burst allowance,
// and never before now) is within the caller's deadline. $2 interval, $3 time
// left before the deadline, $4 burst allowance, all in seconds.
const SLOT = `INSERT INTO host_request_slots AS s (host, next_at) VALUES ($1, now() + make_interval(secs => $2))
  ON CONFLICT (host) DO UPDATE SET next_at = greatest(s.next_at, now()) + make_interval(secs => $2)
  WHERE greatest(s.next_at - make_interval(secs => $4), now()) <= now() + make_interval(secs => $3)
  RETURNING (extract(epoch FROM greatest(s.next_at - make_interval(secs => $2) - make_interval(secs => $4), now())) * 1000)::bigint AS slot_ms,
    (extract(epoch FROM now()) * 1000)::bigint AS now_ms`;

export function createPgHostGate(db, { fallback = createMemoryHostGate(), now = () => Date.now(), wait = sleep, timeoutMs = 300 } = {}) {
  async function remote(host, { spacingMs = 0, perMinute = 0, deadlineAt = Infinity, signal }) {
    const remaining = Number.isFinite(deadlineAt) ? Math.max(0, deadlineAt - now()) : 3_600_000;
    const { intervalMs, toleranceMs } = pacing({ spacingMs, perMinute });
    const { rows } = await db.query(SLOT, [host, intervalMs / 1000, remaining / 1000, toleranceMs / 1000], { timeoutMs });
    if (!rows.length) throw busy();
    // Database clock minus this instance's clock.
    const offset = Number(rows[0].now_ms) - now();
    await wait(Number(rows[0].slot_ms) - offset - now(), signal);
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
