// Its own leaf module (no imports) so both localState.ts and readingLight.ts can depend on
// it without a cycle: localState.ts imports READING_LIGHT_STORAGE_KEY from readingLight.ts,
// so this adapter must sit below both of them in the dependency graph.

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
