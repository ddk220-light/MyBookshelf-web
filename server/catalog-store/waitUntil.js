// Runs `task` after the current response, and asks the hosting platform to
// keep the function alive until it settles (Vercel's waitUntil, read from the
// request context the platform installs; the same hook `@vercel/functions`
// uses). Locally, or outside a request, the task simply runs in the
// background. A task that fails is dropped, never retried.
const REQUEST_CONTEXT = Symbol.for('@vercel/request-context');

export function waitUntil(task) {
  const promise = new Promise(resolve => { setImmediate(resolve); })
    .then(() => (typeof task === 'function' ? task() : task))
    .catch(() => {});
  try { globalThis[REQUEST_CONTEXT]?.get?.()?.waitUntil?.(promise); } catch { /* Background only. */ }
  return promise;
}
