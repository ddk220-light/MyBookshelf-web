type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type ServiceWorkerContainerLike = {
  getRegistrations: () => Promise<ReadonlyArray<{ unregister: () => Promise<boolean> }>>;
};

type CacheStorageLike = Pick<CacheStorage, 'keys' | 'delete'>;

const CUTOVER_MARKER_KEY = 'mybookshelf.anonymous-web.cutover.v1';
const LEGACY_SESSION_STORAGE_KEYS = ['authFlash'];

// Deliberately its own copy, not the shared adapter in browserStorage.ts (Task 13
// review triage): that shared `browserStorage()` takes no argument and only ever
// returns `window.localStorage`, while this module needs both localStorage AND
// sessionStorage (LEGACY_SESSION_STORAGE_KEYS above) — genuinely incompatible
// signatures, not a leftover duplicate to consolidate.
function browserStorage(kind: 'localStorage' | 'sessionStorage'): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window[kind];
  } catch {
    return null;
  }
}

function isLegacyCacheName(name: string): boolean {
  return name === 'mybookshelf'
    || name.startsWith('mybookshelf-')
    || name.startsWith('workbox-precache-');
}

export type LegacyCleanupDependencies = {
  localStorage?: StorageLike | null;
  sessionStorage?: StorageLike | null;
  serviceWorker?: ServiceWorkerContainerLike | null;
  cacheStorage?: CacheStorageLike | null;
};

/**
 * Best-effort, one-time removal of browser state used by the retired account
 * site. It never reads or imports legacy values, and deliberately leaves the
 * anonymous selection/recent-book record untouched.
 */
export async function clearLegacyBrowserState({
  localStorage = browserStorage('localStorage'),
  sessionStorage = browserStorage('sessionStorage'),
  serviceWorker = typeof navigator === 'undefined' ? null : navigator.serviceWorker,
  cacheStorage = typeof caches === 'undefined' ? null : caches,
}: LegacyCleanupDependencies = {}): Promise<void> {
  try {
    if (localStorage?.getItem(CUTOVER_MARKER_KEY) === 'complete') return;
  } catch {
    // Private browsing or a blocked storage policy can still safely continue.
  }

  for (const key of LEGACY_SESSION_STORAGE_KEYS) {
    try { sessionStorage?.removeItem(key); } catch { /* best effort */ }
  }

  const work: Array<Promise<unknown>> = [];
  if (serviceWorker) {
    work.push(serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))));
  }
  if (cacheStorage) {
    work.push(cacheStorage.keys().then((names) => Promise.all(
      names.filter(isLegacyCacheName).map((name) => cacheStorage.delete(name)),
    )));
  }
  await Promise.allSettled(work);

  try { localStorage?.setItem(CUTOVER_MARKER_KEY, 'complete'); } catch { /* best effort */ }
}
