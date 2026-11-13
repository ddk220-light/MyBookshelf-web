import { useSyncExternalStore } from 'react';
const listeners = new Map<string, MediaQueryList>();
function media(query: string) {
  if (typeof window.matchMedia !== 'function') return null;
  if (!listeners.has(query)) listeners.set(query, window.matchMedia(query));
  return listeners.get(query)!;
}
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(callback => {
    const match = media(query);
    match?.addEventListener?.('change', callback);
    return () => match?.removeEventListener?.('change', callback);
  }, () => media(query)?.matches || false, () => false);
}
