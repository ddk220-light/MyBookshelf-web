export const OPEN_LIBRARY_MAX_IN_FLIGHT = 3;
const OPEN_LIBRARY_PER_SECOND = 3;
const OPEN_LIBRARY_SEARCH_SPACING_MS = 1000;

function deadlineError() {
  return Object.assign(new Error('Open Library read waited past its deadline'), { code: 'OPEN_LIBRARY_DEADLINE' });
}

// Identified Open Library clients may start up to three requests per second.
// Let the reads of one search share a turn while keeping a process-wide cap
// on starts and concurrency. Ungrouped reads still take their own turn.
export function createOpenLibraryPacer({ maxInFlight = OPEN_LIBRARY_MAX_IN_FLIGHT, perWindow = OPEN_LIBRARY_PER_SECOND,
  windowMs = 1000, searchSpacingMs = OPEN_LIBRARY_SEARCH_SPACING_MS, now = Date.now } = {}) {
  let inFlight = 0;
  let nextSearchAt = 0;
  let timer;
  const starts = [];
  const queue = [];
  const admitted = new WeakSet();

  function pump() {
    clearTimeout(timer);
    const at = now();
    while (starts.length && at - starts[0] >= windowMs) starts.shift();

    // Expiring a queued read must neither dispatch it nor take a search turn.
    let nextDeadline = Infinity;
    for (let index = queue.length - 1; index >= 0; index--) {
      const item = queue[index];
      if (at >= item.deadlineAt) {
        queue.splice(index, 1);
        item.reject(deadlineError());
      } else {
        nextDeadline = Math.min(nextDeadline, item.deadlineAt);
      }
    }

    let blockedUntil = Infinity;
    while (queue.length && inFlight < maxInFlight) {
      const head = queue[0];
      const newSearch = !head.group || !admitted.has(head.group);
      const windowAt = starts.length >= perWindow ? starts[0] + windowMs : at;
      blockedUntil = Math.max(windowAt, newSearch ? nextSearchAt : at);
      if (blockedUntil > at) break;

      queue.shift();
      if (newSearch) {
        nextSearchAt = at + searchSpacingMs;
        if (head.group) admitted.add(head.group);
      }
      starts.push(at);
      inFlight++;
      head.resolve();
    }

    if (!queue.length) return;
    const wakeAt = inFlight < maxInFlight ? Math.min(blockedUntil, nextDeadline) : nextDeadline;
    if (Number.isFinite(wakeAt)) timer = setTimeout(pump, Math.max(1, wakeAt - at));
  }

  return async function paced(task, { group = null, deadlineAt = Infinity } = {}) {
    await new Promise((resolve, reject) => {
      queue.push({ group, deadlineAt, resolve, reject });
      pump();
    });
    try {
      if (now() >= deadlineAt) throw deadlineError();
      return await task();
    } finally {
      inFlight--;
      pump();
    }
  };
}
