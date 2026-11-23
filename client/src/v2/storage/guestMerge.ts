import { browserStorage } from '../browserStorage';
import { emptyState, readAnonymousWebStateWithStatus, writeAnonymousWebState, type AnonymousWebState, type AnonymousWebStateRead } from '../localState';
import { isOnShelf } from '../oneShelfState';
import { READER_PREFERENCES_KEY } from '../readerState';
import { withGuestStorageLock } from './guestLock';
import type { ReadingSnapshot } from './AccountRepository';

/**
 * Automatic merge at sign-in (plan B5). The browser keeps its guest shelf, so
 * it remembers what it has already sent to an account: a book later removed
 * from the account never comes back from this browser. Each record belongs
 * to one account (an opaque code of its ID), and the browser keeps one for
 * each of the last few accounts used here, so readers who take turns on one
 * browser each keep their own; a new account after the old one was deleted
 * starts afresh. Only book keys, a library ID, the reader's answer, when a
 * merge last failed and when one started are kept here, never search text,
 * the address or the plain ID.
 */
export const MERGED_KEY = 'mybookshelf.merged.v1';
/**
 * Set when this browser asks for a log-in link, creates an account or signs
 * in with a password: an opaque code of the address typed, and when. After
 * sign-in the merge runs on its own only when this matches the account that
 * signed in; any other account (for example one whose link someone else
 * sent) is asked first.
 */
export const SIGN_IN_MARK_KEY = 'mybookshelf.sign-in-mark.v1';
/** A mark is good for the longest link it can wait for (verification: 24 hours). */
export const SIGN_IN_MARK_MS = 25 * 60 * 60 * 1000;
const LIMIT = 2000;
/** Records kept: the accounts most recently used on this browser. */
export const MERGED_ACCOUNTS_KEPT = 5;
/**
 * How long a merge another tab has started keeps this tab from starting the
 * same one (the network part runs outside the storage lock). Checked at the
 * next load, no timers; a tab closed mid-merge holds nobody up for longer.
 */
export const MERGE_IN_PROGRESS_MS = 2 * 60 * 1000;

/**
 * One-way, non-reversible code for an account identifier or address (two
 * independent 53-bit string hashes). It only has to tell accounts apart in
 * this browser; it is never sent anywhere.
 */
export function opaqueCode(value: string): string {
  const hash = (seed: number) => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < value.length; i++) {
      const ch = value.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  };
  return hash(1) + '.' + hash(2);
}
/** The merged record's owner: a code of the signed-in account's ID. */
export const accountCode = (userId: string) => opaqueCode('account:' + userId);
const addressCode = (email: string) => opaqueCode('address:' + email.trim().toLowerCase());

export type MergeConsent = 'yes' | 'not-now';
export type MergedRecord = {
  version: 2;
  account: string;
  saved: string[];
  viewed: string[];
  libraries: string[];
  /** "Add them" or "Not now" for this account; absent until known. */
  consent?: MergeConsent;
  /** The last failed merge (ms) and how many failed in a row: the next load waits longer each time. */
  failedAt?: number;
  failures?: number;
  /** When a tab started sending this browser's books to the account (ms); cleared when it settles. */
  mergingSince?: number;
};
type StoredEntry = Omit<MergedRecord, 'version' | 'account'> & { usedAt: number };
type Stored = { version: 3; accounts: Record<string, StoredEntry> };
const empty = (account: string): MergedRecord => ({ version: 2, account, saved: [], viewed: [], libraries: [] });
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length < 4500).slice(-LIMIT) : [];
const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
function clean(account: string, raw: Omit<Partial<MergedRecord>, 'version'>): MergedRecord {
  return {
    version: 2, account, saved: strings(raw.saved), viewed: strings(raw.viewed), libraries: strings(raw.libraries),
    ...(raw.consent === 'yes' || raw.consent === 'not-now' ? { consent: raw.consent } : {}),
    ...(count(raw.failedAt) !== undefined ? { failedAt: count(raw.failedAt), failures: Math.max(1, count(raw.failures) ?? 1) } : {}),
    ...(count(raw.mergingSince) !== undefined ? { mergingSince: count(raw.mergingSince) } : {}),
  };
}
const entryOf = ({ version: _version, account: _account, ...entry }: MergedRecord, usedAt: number): StoredEntry => ({ ...entry, usedAt });
/** Every account's record; a version-2 record (one account per browser) becomes the first entry of the map. */
function readStored(): Stored {
  try {
    const raw = JSON.parse(browserStorage()?.getItem(MERGED_KEY) || 'null') as (Omit<Partial<MergedRecord>, 'version'> & { version?: number; accounts?: unknown }) | null;
    if (raw?.version === 2 && typeof raw.account === 'string') return { version: 3, accounts: { [raw.account]: entryOf(clean(raw.account, raw), 0) } };
    if (raw?.version !== 3 || !raw.accounts || typeof raw.accounts !== 'object') return { version: 3, accounts: {} };
    const accounts: Record<string, StoredEntry> = {};
    for (const [account, value] of Object.entries(raw.accounts as Record<string, Partial<StoredEntry> | null>)) {
      if (value && typeof value === 'object') accounts[account] = entryOf(clean(account, value), count(value.usedAt) ?? 0);
    }
    return { version: 3, accounts };
  } catch { return { version: 3, accounts: {} }; }
}

/** This account's record; a fresh one when this browser has none for it. */
export function readMerged(account: string): MergedRecord {
  const entry = readStored().accounts[account];
  return entry ? clean(account, entry) : empty(account);
}
/** Writes this account's record; only the most recently used accounts are kept. */
function writeMerged(record: MergedRecord, now = Date.now()): boolean {
  const stored = readStored();
  stored.accounts[record.account] = entryOf(record, Math.max(now, ...Object.values(stored.accounts).map(entry => entry.usedAt + 1)));
  const kept = Object.entries(stored.accounts).sort((a, b) => b[1].usedAt - a[1].usedAt).slice(0, MERGED_ACCOUNTS_KEPT);
  try { browserStorage()?.setItem(MERGED_KEY, JSON.stringify({ version: 3, accounts: Object.fromEntries(kept) })); return true; } catch { return false; }
}

/** Everything the plan settled is remembered for this account; a success ends any back-off and the merge in progress. */
export function rememberMerged(account: string, plan: Pick<MergePlan, 'saved' | 'viewed' | 'library'>): boolean {
  const current = readMerged(account);
  const add = (list: string[], items: string[]) => [...list.filter(item => !items.includes(item)), ...items].slice(-LIMIT);
  const { failedAt: _failedAt, failures: _failures, mergingSince: _mergingSince, ...rest } = current;
  return writeMerged({
    ...rest,
    saved: add(current.saved, plan.saved),
    viewed: add(current.viewed, plan.viewed),
    libraries: add(current.libraries, plan.library ? [plan.library] : []),
  });
}
export function setMergeConsent(account: string, consent: MergeConsent): boolean {
  return writeMerged({ ...readMerged(account), consent });
}

/** Whether a tab started this account's merge a short while ago (so another tab leaves it alone). */
export function mergeInProgress(record: MergedRecord, now = Date.now()): boolean {
  return record.mergingSince !== undefined && record.mergingSince <= now && now - record.mergingSince < MERGE_IN_PROGRESS_MS;
}
/** Notes that this tab is about to send the books (called under the guest storage lock); returns its mark. */
export function startMergeInProgress(account: string, now = Date.now()): number {
  writeMerged({ ...readMerged(account), mergingSince: now }, now);
  return now;
}
/** Clears this tab's mark, if it is still the one recorded. */
export function endMergeInProgress(account: string, since: number): void {
  const current = readMerged(account);
  if (current.mergingSince !== since) return;
  const { mergingSince: _mergingSince, ...rest } = current;
  writeMerged(rest);
}

const BACKOFF_MS = 5 * 60 * 1000, BACKOFF_MAX_MS = 24 * 60 * 60 * 1000;
/** A failed merge waits 5 minutes, then 20, 80… up to a day, checked at the next load (no timers). */
export function mergeRetryAt(record: MergedRecord): number {
  if (record.failedAt === undefined) return 0;
  const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_MS * 4 ** Math.max(0, (record.failures ?? 1) - 1));
  return record.failedAt + wait;
}
export function noteMergeFailure(account: string, now = Date.now()): void {
  const { mergingSince: _mergingSince, ...current } = readMerged(account);
  writeMerged({ ...current, failedAt: now, failures: (current.failures ?? 0) + 1 }, now);
}

/** The account's data is gone (deleted here or found gone): its record goes too; with no account, every record. */
export function forgetMerged(account?: string): void {
  try {
    if (account) {
      const stored = readStored();
      if (!(account in stored.accounts)) return;
      delete stored.accounts[account];
      if (Object.keys(stored.accounts).length) { browserStorage()?.setItem(MERGED_KEY, JSON.stringify(stored)); return; }
    }
    browserStorage()?.removeItem(MERGED_KEY);
  } catch { /* Nothing more to remove. */ }
}

/** Called when this browser asks for a log-in link, creates an account or signs in with a password. */
export function markSignIn(email: string, now = Date.now()): void {
  try { browserStorage()?.setItem(SIGN_IN_MARK_KEY, JSON.stringify({ version: 1, address: addressCode(email), at: now })); } catch { /* Then the reader is asked. */ }
}
/** Whether the account that signed in is the one this browser asked to sign in to, recently. */
export function signInMarkMatches(email: string | undefined, now = Date.now()): boolean {
  if (!email) return false;
  try {
    const raw = JSON.parse(browserStorage()?.getItem(SIGN_IN_MARK_KEY) || 'null') as { version?: number; address?: string; at?: number } | null;
    return raw?.version === 1 && raw.address === addressCode(email) && typeof raw.at === 'number' && raw.at <= now && now - raw.at < SIGN_IN_MARK_MS;
  } catch { return false; }
}
export function clearSignInMark(): void {
  try { browserStorage()?.removeItem(SIGN_IN_MARK_KEY); } catch { /* It expires on its own. */ }
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
export function planGuestMerge(account: ReadingSnapshot, guest: AnonymousWebStateRead, merged: Pick<MergedRecord, 'saved' | 'viewed' | 'libraries'>): MergePlan | null {
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

/** The same plan without the browser's library (the account refused it). */
export function withoutLibrary(plan: MergePlan): MergePlan {
  const snapshot = { ...plan.snapshot, selectedLibraryId: null };
  return { ...plan, snapshot, policy: 'keep-account', request: Boolean(snapshot.savedBooks.length || snapshot.recentBooks.length) };
}
/** The same plan without the books the account refused (by position in what was sent). */
export function withoutRejected(plan: MergePlan, rejected: { savedBooks?: number[]; recentBooks?: number[] }): MergePlan {
  const drop = (list: AnonymousWebState['savedBooks'], positions: number[] = []) => list.filter((_, index) => !positions.includes(index));
  const snapshot = { ...plan.snapshot, savedBooks: drop(plan.snapshot.savedBooks, rejected.savedBooks), recentBooks: drop(plan.snapshot.recentBooks, rejected.recentBooks) };
  return { ...plan, snapshot, request: Boolean(snapshot.savedBooks.length || snapshot.recentBooks.length || snapshot.selectedLibraryId) };
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
  forgetMerged();
  clearSignInMark();
  try {
    const preferences = JSON.parse(storage?.getItem(READER_PREFERENCES_KEY) || 'null') as Record<string, unknown> | null;
    if (preferences && typeof preferences === 'object' && 'selectedLibrary' in preferences) {
      delete preferences.selectedLibrary;
      storage?.setItem(READER_PREFERENCES_KEY, JSON.stringify(preferences));
    }
  } catch { /* Only a library's display name. */ }
}
