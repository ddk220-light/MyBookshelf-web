import { describe, expect, it } from 'vitest';
import { clearLegacyBrowserState } from './legacyCleanup';

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('clearLegacyBrowserState', () => {
  it('removes only the known legacy browser state and leaves anonymous history alone', async () => {
    const local = storage({ 'mybookshelf.anonymous-web.v1': '{"recentBooks":["keep"]}' });
    const session = storage({ authFlash: 'Old sign-in message', keep: 'keep me' });
    const deletedCaches: string[] = [];
    const registrations = [{ unregister: async () => true }];

    await clearLegacyBrowserState({
      localStorage: local,
      sessionStorage: session,
      serviceWorker: { getRegistrations: async () => registrations },
      cacheStorage: {
        keys: async () => ['mybookshelf-legacy', 'workbox-precache-old', 'unrelated-cache'],
        delete: async (name: string) => { deletedCaches.push(name); return true; },
      },
    });

    expect(session.getItem('authFlash')).toBeNull();
    expect(session.getItem('keep')).toBe('keep me');
    expect(local.getItem('mybookshelf.anonymous-web.v1')).toContain('keep');
    expect(local.getItem('mybookshelf.anonymous-web.cutover.v1')).toBe('complete');
    expect(deletedCaches.sort()).toEqual(['mybookshelf-legacy', 'workbox-precache-old']);
  });

  it('does not rerun after recording the anonymous cutover marker', async () => {
    const local = storage({ 'mybookshelf.anonymous-web.cutover.v1': 'complete' });
    const session = storage({ authFlash: 'keep because cleanup already ran' });
    await clearLegacyBrowserState({ localStorage: local, sessionStorage: session });
    expect(session.getItem('authFlash')).toBe('keep because cleanup already ran');
  });
});
