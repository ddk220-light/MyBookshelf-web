import { browserStorage } from '../browserStorage';
import { emptyState, readAnonymousWebStateWithStatus, writeAnonymousWebState, type AnonymousWebState, type AnonymousWebStateRead } from '../localState';
import { isOnShelf } from '../oneShelfState';
import { READER_PREFERENCES_KEY } from '../readerState';
import { withGuestStorageLock } from './guestLock';
import type { ReadingSnapshot } from './AccountRepository';

/**
 * Automatic merge at sign-in (plan B5). The browser keeps its guest shelf, so
 * it remembers what it has already sent to an account: a book later removed
 * from the account never comes back from this browser. Only book keys and a
 * library ID are kept here, never search text or anything about the account.
 */
export const MERGED_KEY = 'mybookshelf.merged.v1';
const LIMIT = 2000;

export type MergedRecord = { version: 1; saved: string[]; viewed: string[]; libraries: string[] };
const empty = (): MergedRecord => ({ version: 1, saved: [], viewed: [], libraries: [] });
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length < 4500).slice(-LIMIT) : [];

export function readMerged(): MergedRecord {
  try {
    const raw = JSON.parse(browserStorage()?.getItem(MERGED_KEY) || 'null') as Partial<MergedRecord> | null;
    if (raw?.version !== 1) return empty();
    return { version: 1, saved: strings(raw.saved), viewed: strings(raw.viewed), libraries: strings(raw.libraries) };
  } catch { return empty(); }
}

export function rememberMerged(plan: Pick<MergePlan, 'saved' | 'viewed' | 'library'>): boolean {
  const current = readMerged();
  const add = (list: string[], items: string[]) => [...list.filter(item => !items.includes(item)), ...items].slice(-LIMIT);
  try {
    browserStorage()?.setItem(MERGED_KEY, JSON.stringify({
      version: 1,
      saved: add(current.saved, plan.saved),
      viewed: add(current.viewed, plan.viewed),
      libraries: add(current.libraries, plan.library ? [plan.library] : []),
    } satisfies MergedRecord));
    return true;
  } catch { return false; }
}

export type MergePlan = {
  /** What is sent: only the books the account lacks, and the library when the account has none. */
  snapshot: AnonymousWebState;
  /** Whether anything has to be sent (otherwise the browser only notes what the account already holds). */
  request: boolean;
  /** Everything settled by this merge, remembered once it succeeds (sent or already in the account). */
  saved: string[];
  viewed: string[];
  library: string | null;
  policy: 'keep-account' | 'use-device';
};

/** What this browser should settle with the account now, or null when nothing is new. */
export function planGuestMerge(account: ReadingSnapshot, guest: AnonymousWebStateRead, merged: MergedRecord = readMerged()): MergePlan | null {
  if (guest.status !== 'ok') return null;
  const freshSaved = guest.state.savedBooks.filter(book => !merged.saved.includes(book.bookKey));
  const freshViewed = guest.state.recentBooks.filter(book => !merged.viewed.includes(book.bookKey));
  const guestLibrary = guest.state.selectedLibraryId && !merged.libraries.includes(guest.state.selectedLibraryId) ? guest.state.selectedLibraryId : null;
  if (!freshSaved.length && !freshViewed.length && !guestLibrary) return null;
  const savedBooks = freshSaved.filter(book => !isOnShelf(account.books, book));
  const recentBooks = freshViewed.filter(book => !account.recent.some(item => item.bookKey === book.bookKey));
  // The account's library wins; the browser's is used only when the account has none.
  const library = guestLibrary && !account.summary.selectedLibraryId ? guestLibrary : null;
  return {
    snapshot: { ...emptyState(), selectedLibraryId: library, savedBooks, recentBooks },
    request: Boolean(savedBooks.length || recentBooks.length || library),
    saved: freshSaved.map(book => book.bookKey),
    viewed: freshViewed.map(book => book.bookKey),
    library: guestLibrary,
    policy: library ? 'use-device' : 'keep-account',
  };
}

/**
 * After the account is deleted (plan B7): this browser's copy of the shelf,
 * Viewed before, the chosen library and the merged list go too. Free books
 * and papers saved here were never part of the account and stay.
 */
export async function clearDeviceCopy(): Promise<void> {
  try {
    await withGuestStorageLock(() => {
      const current = readAnonymousWebStateWithStatus();
      writeAnonymousWebState({ ...emptyState(), savedContent: current.status === 'ok' ? current.state.savedContent : [] });
    });
  } catch { /* Best effort: the account itself is already gone. */ }
  const storage = browserStorage();
  try { storage?.removeItem(MERGED_KEY); } catch { /* Nothing more to remove. */ }
  try {
    const preferences = JSON.parse(storage?.getItem(READER_PREFERENCES_KEY) || 'null') as Record<string, unknown> | null;
    if (preferences && typeof preferences === 'object' && 'selectedLibrary' in preferences) {
      delete preferences.selectedLibrary;
      storage?.setItem(READER_PREFERENCES_KEY, JSON.stringify(preferences));
    }
  } catch { /* Only a library's display name. */ }
}
