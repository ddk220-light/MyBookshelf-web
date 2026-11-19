// Open Library pacing for book discovery (plan A5). Reads used to pass one
// at a time through a single process-wide lane, 1 s apart, so the three
// searches a reader's search starts together took three seconds or more.
//
// Pacing is now per search, not per read:
// - a search (a `group` token: any object, shared by that search's reads)
//   waits for its turn once; searches still start at least `searchSpacingMs`
//   apart across this process, as reads did before;
// - its reads then go together, limited across the process to
//   `maxInFlight` requests at once and `perWindow` request starts in any
//   `windowMs`, so concurrent searches stay polite;
// - a read with no group is its own search: those keep the old 1 s spacing.
// A read still waiting when its deadline passes is dropped without a request.
// No timer runs except while a read is waiting for its turn or a slot.

const coded = (message, code) => Object.assign(new Error(message), { code });
const deadlineError = () => coded('Open Library read waited past its deadline', 'OPEN_LIBRARY_DEADLINE');

export const OPEN_LIBRARY_MAX_IN_FLIGHT = 3;
export const OPEN_LIBRARY_PER_SECOND = 3;
export const OPEN_LIBRARY_SEARCH_SPACING_MS = 1000;

export function createOpenLibraryPacer({ maxInFlight = OPEN_LIBRARY_MAX_IN_FLIGHT, perWindow = OPEN_LIBRARY_PER_SECOND, windowMs = 1000,
  searchSpacingMs = OPEN_LIBRARY_SEARCH_SPACING_MS, now = () => Date.now() } = {}) {
  let inFlight = 0, nextSearchAt = 0, timer = null;
  const starts = [], queue = [];
  const turns = new WeakMap();

  function pump() {
    clearTimeout(timer);
    timer = null;
    while (queue.length) {
      const at = now();
      while (starts.length && at - starts[0] >= windowMs) starts.shift();
      const head = queue[0];
      if (head.deadlineAt != null && at >= head.deadlineAt) { queue.shift(); head.reject(deadlineError()); continue; }
      if (inFlight >= maxInFlight) return;
      if (starts.length >= perWindow) {
        timer = setTimeout(pump, Math.max(1, windowMs - (at - starts[0])));
        return;
      }
      queue.shift();
      inFlight += 1;
      starts.push(at);
      head.resolve();
    }
  }

  function slot(deadlineAt) {
    return new Promise((resolve, reject) => { queue.push({ resolve, reject, deadlineAt }); pump(); });
  }

  // A search's turn: reserved by its first read, shared by the rest.
  function turn(group) {
    const known = group ? turns.get(group) : null;
    if (known) return known;
    const at = Math.max(now(), nextSearchAt);
    nextSearchAt = at + searchSpacingMs;
    const wait = at - now();
    const ready = wait > 0 ? new Promise(resolve => { setTimeout(resolve, wait); }) : Promise.resolve();
    if (group) turns.set(group, ready);
    return ready;
  }

  return async function paced(task, { group = null, deadlineAt = null } = {}) {
    await turn(group);
    if (deadlineAt != null && now() >= deadlineAt) throw deadlineError();
    await slot(deadlineAt);
    try {
      return await task();
    } finally {
      inFlight -= 1;
      pump();
    }
  };
}
