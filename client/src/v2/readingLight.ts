import { browserStorage, type StorageLike } from './browserStorage';

export type ReadingLight = 'daylight' | 'lamplight' | 'ink';
export type ReadingLightPreference = ReadingLight | 'system';
export const APPEARANCE_STORAGE_KEY = 'mybookshelf.appearance.v1';

// Exported so the "clear everything" path in localState.ts removes the same key
// this module writes; a rename must not silently orphan the clear.
export const READING_LIGHT_STORAGE_KEY = 'mybookshelf.anonymous-web.reading-light';

export function readReadingLight(storage: StorageLike | null = browserStorage()): ReadingLight {
  const preference = readReadingLightPreference(storage);
  return preference === 'system' ? 'daylight' : preference;
}

export function readReadingLightPreference(storage: StorageLike | null = browserStorage()): ReadingLightPreference {
  if (!storage) return 'system';
  try {
    const raw = storage.getItem(APPEARANCE_STORAGE_KEY);
    if (raw && raw.length < 200) {
      try {
        const saved = JSON.parse(raw);
        if (saved?.version === 1 && ['daylight', 'lamplight', 'ink', 'system'].includes(saved.preference)) return saved.preference;
      } catch { /* A damaged optional preference must not erase the legacy explicit choice. */ }
    }
    const value = storage.getItem(READING_LIGHT_STORAGE_KEY);
    return value === 'lamplight' || value === 'daylight' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function writeReadingLight(light: ReadingLightPreference, storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ version: 1, preference: light }));
    if (light !== 'system') storage.setItem(READING_LIGHT_STORAGE_KEY, light);
    return true;
  } catch {
    return false;
  }
}
