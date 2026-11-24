// A catalog host's refusal (HTTP 401, 403 or 429) turns that host off on this
// server instance for a short time, so that one refusing host is not asked
// again by every reader of every library it serves (Georgia PINES's 51
// systems on gapines.org, e-Granthalaya's members on eg4.nic.in, IndCat's
// institutions). The latch expires: after REFUSAL_LATCH_MS the next check asks
// the host once more, still within the host pacing, and a second refusal turns
// it off again (coordinator, 24 November 2026: robustness, instead of "until
// the instance restarts"). While it is on, a check is "couldn't check", never
// "not found".
export const REFUSAL_LATCH_MS = 15 * 60 * 1000;
const MAX_KEYS = 1_000;

export function createRefusalLatch({ ttlMs = REFUSAL_LATCH_MS, now = () => Date.now() } = {}) {
  // key (an origin) -> when the latch ends
  const until = new Map();
  return Object.freeze({
    /** Whether the key is latched now; an expired latch is forgotten. */
    has(key) {
      const at = until.get(key);
      if (at === undefined) return false;
      if (at > now()) return true;
      until.delete(key);
      return false;
    },
    /** Latches the key for `ttlMs` from now. */
    add(key) {
      until.delete(key);
      until.set(key, now() + ttlMs);
      if (until.size > MAX_KEYS) until.delete(until.keys().next().value);
    },
    clear() { until.clear(); },
  });
}
