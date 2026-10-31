import { browserStorage } from './browserStorage';
import type { Availability } from './types';

export const READER_PREFERENCES_KEY = 'mybookshelf.reader-preferences.v1';
export const AVAILABILITY_CACHE_KEY = 'mybookshelf.availability.v1';
export const LOOKUP_PREFERENCES_KEY = 'mybookshelf.lookup-preferences.v1';
export type ReaderPreferences = {
  version: 1;
  shelfView: 'shelf' | 'list';
  shelfSort: 'recent' | 'title' | 'author';
  selectedLibrary?: { id: string; name: string };
};
const defaults: ReaderPreferences = { version: 1, shelfView: 'shelf', shelfSort: 'recent' };
// Optional records never overwrite the original shelf. Failed writes still work in this session.
const session = new Map<string, string>();
function read(key: string, maximum: number): unknown {
  try {
    const value = session.get(key) ?? browserStorage()?.getItem(key);
    return value && value.length <= maximum ? JSON.parse(value) : null;
  } catch { return null; }
}
function write(key: string, value: unknown): boolean {
  const json = JSON.stringify(value);
  try {
    const storage = browserStorage();
    if (!storage) { session.set(key, json); return false; }
    storage.setItem(key, json);
    session.delete(key);
    return true;
  } catch { session.set(key, json); return false; }
}
function writeEntries(key: string, entries: unknown[], maximum: number): boolean {
  const bounded = entries.slice(0, 300);
  while (bounded.length && JSON.stringify({ version: 1, entries: bounded }).length > maximum) bounded.pop();
  return write(key, { version: 1, entries: bounded });
}
export function readReaderPreferences(): ReaderPreferences {
  const raw = read(READER_PREFERENCES_KEY, 4000) as Partial<ReaderPreferences> | null;
  if (raw?.version !== 1) return { ...defaults };
  const selected = raw.selectedLibrary;
  return {
    ...defaults,
    shelfView: raw.shelfView === 'list' ? 'list' : 'shelf',
    shelfSort: raw.shelfSort === 'title' || raw.shelfSort === 'author' ? raw.shelfSort : 'recent',
    ...(selected && typeof selected.id === 'string' && selected.id.length <= 160 && typeof selected.name === 'string' && selected.name.length <= 500 ? { selectedLibrary: selected } : {}),
  };
}
export function writeReaderPreferences(patch: Partial<Omit<ReaderPreferences, 'version'>>): boolean {
  return write(READER_PREFERENCES_KEY, { ...readReaderPreferences(), ...patch, version: 1 });
}
export type LookupPreferences = { editionScope: 'work' | 'exact'; language?: string };
function lookupEntries(): Array<{ bookKey: string; options: LookupPreferences }> {
  const record = read(LOOKUP_PREFERENCES_KEY, 1_500_000) as { version?: number; entries?: Array<{ bookKey: string; options: LookupPreferences }> } | null;
  return record?.version === 1 && Array.isArray(record.entries) ? record.entries.slice(0, 300).filter(entry => typeof entry?.bookKey === 'string' && entry.bookKey.length < 4500
    && ['work', 'exact'].includes(entry.options?.editionScope) && (!entry.options.language || /^[a-z]{3}$/.test(entry.options.language))) : [];
}
export function readBookLookup(bookKey: string): LookupPreferences | undefined { return lookupEntries().find(entry => entry.bookKey === bookKey)?.options; }
export function rememberBookLookup(bookKey: string, options?: LookupPreferences): boolean {
  return writeEntries(LOOKUP_PREFERENCES_KEY, [{ bookKey, options: options || { editionScope: 'work' } }, ...lookupEntries().filter(entry => entry.bookKey !== bookKey)], 1_500_000);
}
export function availabilityKey(libraryId: string, bookKey: string, options?: LookupPreferences): string {
  return JSON.stringify([libraryId, bookKey, bookKey.startsWith('v1:catalog:') ? 'record' : options?.editionScope || 'work', bookKey.startsWith('v1:catalog:') ? '' : options?.language || '']);
}
// Retained server observations are useful to the server, but are never a successful current check.
export function currentAvailability(result: Availability): Availability {
  if (result.freshness !== 'stale') return result;
  return { outcome: 'unknown', lookupKind: result.lookupKind, matchKind: null, freshness: 'none', attemptedAt: result.attemptedAt,
    errorCode: result.errorCode || 'CATALOG_UNAVAILABLE', catalogUrl: result.catalogUrl, catalogLinkKind: result.catalogLinkKind, attribution: result.attribution };
}
type CacheEntry = { key: string; result: Availability };
function cacheEntries(): CacheEntry[] {
  const value = read(AVAILABILITY_CACHE_KEY, 1_000_000) as { version?: number; entries?: unknown[] } | null;
  if (value?.version !== 1 || !Array.isArray(value.entries)) return [];
  return value.entries.slice(0, 300).filter((entry): entry is CacheEntry => {
    const item = entry as CacheEntry | null;
    return Boolean(item && typeof item.key === 'string' && item.key.length < 5000 && item.result
      && ['available', 'none_available', 'in_catalog', 'no_match', 'not_found', 'unknown'].includes(item.result.outcome)
      && ['fresh', 'stale', 'none'].includes(item.result.freshness)
      && typeof item.result.attemptedAt === 'string');
  });
}
export function readCachedAvailability(libraryId: string, bookKey: string, options?: LookupPreferences): Availability | null {
  const result = cacheEntries().find(item => item.key === availabilityKey(libraryId, bookKey, options))?.result;
  return result ? currentAvailability(result) : null;
}
export function cacheAvailability(libraryId: string, bookKey: string, options: LookupPreferences | undefined, result: Availability): boolean {
  const key = availabilityKey(libraryId, bookKey, options);
  const normalized = currentAvailability(result);
  // Shelf summaries need status only; avoid retaining unbounded provider records or branch lists.
  const summary: Availability = { outcome: normalized.outcome, lookupKind: normalized.lookupKind, matchKind: normalized.matchKind,
    freshness: normalized.freshness, attemptedAt: normalized.attemptedAt, errorCode: normalized.errorCode?.slice(0, 100), loanRestriction: normalized.loanRestriction,
    availableCopies: normalized.availableCopies, notForLoanCopies: normalized.notForLoanCopies, catalogMatchCount: normalized.catalogMatchCount };
  return writeEntries(AVAILABILITY_CACHE_KEY, [{ key, result: summary }, ...cacheEntries().filter(item => item.key !== key)], 1_000_000);
}
export function clearReaderState(): void {
  for (const key of [READER_PREFERENCES_KEY, AVAILABILITY_CACHE_KEY, LOOKUP_PREFERENCES_KEY]) {
    session.delete(key);
    try { browserStorage()?.removeItem(key); } catch { /* Session has already been cleared. */ }
  }
}
