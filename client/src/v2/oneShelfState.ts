// Browser state for the one-shelf redesign (plan section 3.4).
//
// The existing record `mybookshelf.anonymous-web.v1` is NOT changed: its
// version stays 2 and its shape stays byte-compatible, so an older bundle (a
// rollback or a stale tab) keeps reading it without opening recovery mode.
// savedBooks is the shelf, recentBooks is "Viewed before", selectedLibraryId is
// the chosen library and savedContent stays on the shelf. Settings that only
// the new screens use live under their own key, below.
//
// Search text is never stored here or anywhere else in the browser.
import { browserStorage, type StorageLike } from './browserStorage';
import { DOG_ANIMATION_STORAGE_KEY, dedupeSavedBooks, readAnonymousWebStateWithStatus, writeAnonymousWebState } from './localState';
import { removeRetiredReaderCaches } from './readerState';
import { withGuestStorageLock } from './storage/guestLock';
import type { RecentBook } from './types';

export const ONE_SHELF_STORAGE_KEY = 'mybookshelf.one-shelf.v1';
const MAX_RECORD_LENGTH = 4_000;

export type OneShelfState = {
  version: 1;
  /** "Not now" on the account invite hides it for good. */
  accountInviteDismissed?: true;
  /** When the one-time browser migration finished (ISO time). */
  migratedAt?: string;
};

type StoredRecord = { known: OneShelfState; unknown: Record<string, unknown> };

function readRecord(storage: StorageLike | null): StoredRecord {
  const empty: StoredRecord = { known: { version: 1 }, unknown: {} };
  if (!storage) return empty;
  try {
    const raw = storage.getItem(ONE_SHELF_STORAGE_KEY);
    if (!raw || raw.length > MAX_RECORD_LENGTH) return empty;
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.version !== 1) return empty;
    const { version: _version, accountInviteDismissed, migratedAt, ...unknown } = parsed;
    return {
      known: {
        version: 1,
        ...(accountInviteDismissed === true ? { accountInviteDismissed: true as const } : {}),
        ...(typeof migratedAt === 'string' && Number.isFinite(Date.parse(migratedAt)) ? { migratedAt } : {}),
      },
      unknown,
    };
  } catch {
    return empty;
  }
}

/** Reads the one-shelf settings. Unknown fields are ignored; a damaged record reads as defaults. */
export function readOneShelfState(storage: StorageLike | null = browserStorage()): OneShelfState {
  return readRecord(storage).known;
}

/**
 * Merges known fields into the record. Fields this bundle does not know are
 * kept, so a newer bundle's settings survive a rollback.
 */
export function writeOneShelfState(patch: Partial<Omit<OneShelfState, 'version'>>, storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false;
  const current = readRecord(storage);
  const next = { ...current.unknown, ...current.known, ...patch, version: 1 };
  if (next.accountInviteDismissed !== true) delete next.accountInviteDismissed;
  try {
    storage.setItem(ONE_SHELF_STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function dismissAccountInvite(storage: StorageLike | null = browserStorage()): boolean {
  return writeOneShelfState({ accountInviteDismissed: true }, storage);
}

export type OneShelfMigrationResult = 'migrated' | 'already-migrated' | 'unavailable';

/**
 * One-time, best-effort browser migration for the one-shelf screens:
 * - collapses duplicate saved books in the existing record (same version and shape);
 * - removes the availability summaries and per-book edition settings;
 * - removes the retired companion setting.
 * Reading light, reader preferences, the shelf, Viewed before, saved free items
 * and the chosen library are kept. A damaged record is left untouched for the
 * existing recovery screen. Runs under the guest write lock so another tab's
 * save is never lost.
 */
export async function runOneShelfMigration({
  storage = browserStorage(),
  now = () => new Date().toISOString(),
  removeReaderCaches = removeRetiredReaderCaches,
}: { storage?: StorageLike | null; now?: () => string; removeReaderCaches?: () => void } = {}): Promise<OneShelfMigrationResult> {
  if (!storage) return 'unavailable';
  if (readOneShelfState(storage).migratedAt) return 'already-migrated';
  try {
    return await withGuestStorageLock(() => {
      if (readOneShelfState(storage).migratedAt) return 'already-migrated' as const;
      const shelf = readAnonymousWebStateWithStatus(storage);
      if (shelf.status === 'unavailable') return 'unavailable' as const;
      if (shelf.status === 'ok') {
        const deduped = dedupeSavedBooks(shelf.state);
        if (deduped !== shelf.state && !writeAnonymousWebState(deduped, storage)) return 'unavailable' as const;
      }
      removeReaderCaches();
      try { storage.removeItem(DOG_ANIMATION_STORAGE_KEY); } catch { /* best effort */ }
      return writeOneShelfState({ migratedAt: now() }, storage) ? 'migrated' as const : 'unavailable' as const;
    });
  } catch {
    return 'unavailable';
  }
}

// Saved-book identity (plan 3.3): a book is on the shelf when a saved item has
// the same bookKey or the same ISBN-13. Titles and authors are never compared.
export type BookIdentity = { bookKey: string; isbn13?: string | null };

function isbn13Of(value: string | null | undefined): string | null {
  const digits = typeof value === 'string' ? value.replace(/[\s-]/g, '') : '';
  return /^97[89]\d{10}$/.test(digits) ? digits : null;
}

export function findSavedBook(savedBooks: readonly RecentBook[], book: BookIdentity): RecentBook | undefined {
  const byKey = savedBooks.find((saved) => saved.bookKey === book.bookKey);
  if (byKey) return byKey;
  const isbn = isbn13Of(book.isbn13);
  return isbn ? savedBooks.find((saved) => isbn13Of(saved.isbn13) === isbn) : undefined;
}

export function isOnShelf(savedBooks: readonly RecentBook[], book: BookIdentity): boolean {
  return Boolean(findSavedBook(savedBooks, book));
}
