import { useEffect, useReducer, useSyncExternalStore } from 'react';
import { publicApi, webLink, type HoldingsCheck } from '../../api';
import { useLibrary } from '../../context';
import { holdingsKey, useHoldingsStore, type HoldingsStore } from '../../holdings';
import { readReaderPreferences } from '../../readerState';
import type { PublicLibrary } from '../../types';

/**
 * The longest the book page waits for one check before saying it couldn't
 * check. Every library's check may take 45 s and the server answers within
 * 60 s of the request (CHECK_REPLY_MS, server/public-v2/holdings.js), so the
 * page waits a little longer than that rather than cutting off a real answer.
 */
export const CHECK_TIMEOUT_MS = 65_000;

export type CardAnswer = 'checking' | 'found' | 'not_found' | 'unconfirmed' | 'unknown' | 'unsupported';
export type LibraryCardModel =
  | { kind: 'none' }
  | { kind: 'library'; answer: CardAnswer; name: string; place?: string; catalogUrl?: string; catalogLinkKind?: HoldingsCheck['catalogLinkKind']; retry?: () => void;
      /** Why the check could not answer ("unknown" and "unconfirmed" only). */
      reason?: HoldingsCheck['reason'];
      /** A found answer's matching rows from the library's catalog. */
      matches?: HoldingsCheck['matches'];
      /** The library's catalog may take longer than half a minute to answer. */
      slowCatalog?: boolean };

/**
 * True unless the library says its check answers within 30 s. The directory
 * sends `answerWithinSeconds` (the library's own check limit) for libraries
 * the app can check; without it the card does not promise half a minute.
 */
export function slowCatalog(library: Pick<PublicLibrary, 'answerWithinSeconds'> | null | undefined): boolean {
  const seconds: unknown = library?.answerWithinSeconds;
  return !(typeof seconds === 'number' && seconds > 0 && seconds <= 30);
}

/**
 * One check per opening of a book, by library and exact book key, per holdings
 * store (one per visit and identity). Every drawing of the page holds it: the
 * page is drawn again when the window crosses the phone and desktop layouts
 * (and twice in development), and the new drawing takes over the running
 * check, or its answer. A check nobody holds is cancelled and forgotten on the
 * next task, so leaving the book or choosing another library still ends it.
 */
type Check = { reply: HoldingsCheck | null; holders: Set<() => void>; stop: () => void };
const checks = new WeakMap<HoldingsStore, Map<string, Check>>();
function checksOf(store: HoldingsStore): Map<string, Check> {
  let open = checks.get(store);
  if (!open) checks.set(store, open = new Map());
  return open;
}

/** Holds the book's check, starting it when there is none; `keep` puts its answer in the holdings store. */
function holdCheck(store: HoldingsStore, libraryId: string, bookKey: string, keep: boolean, answered: () => void): () => void {
  const open = checksOf(store), key = holdingsKey(libraryId, bookKey);
  const check = open.get(key) || startCheck(store, libraryId, bookKey, keep);
  open.set(key, check);
  check.holders.add(answered);
  return () => {
    check.holders.delete(answered);
    setTimeout(() => {
      if (check.holders.size) return;
      check.stop();
      if (open.get(key) === check) open.delete(key);
    }, 0);
  };
}

function startCheck(store: HoldingsStore, libraryId: string, bookKey: string, keep: boolean): Check {
  const controller = new AbortController();
  let stopped = false;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, CHECK_TIMEOUT_MS);
  const check: Check = { reply: null, holders: new Set(), stop: () => { stopped = true; clearTimeout(timer); controller.abort(); } };
  const settle = (reply: HoldingsCheck) => {
    clearTimeout(timer);
    if (stopped) return;
    check.reply = reply;
    if (keep) store.set(libraryId, { [bookKey]: reply.answer },
      reply.catalogUrl && reply.catalogLinkKind === 'record' ? { [bookKey]: reply.catalogUrl } : undefined, { [bookKey]: reply.matches || [] });
    for (const answered of [...check.holders]) answered();
  };
  publicApi.holdingsCheck(libraryId, bookKey, controller.signal)
    .then(settle, () => settle(timedOut ? { answer: 'unknown', reason: 'timeout' } : { answer: 'unknown' }));
  return check;
}

/**
 * The chosen library's answer for one book (plan 3.5, POST /holdings/check):
 * the stored answer, else one live check. The answer is held together with
 * the library and the exact book key it was asked for, so it is never shown
 * for another book or edition, or after the library changes. Any failure,
 * time-out or unreadable reply is "unknown" (couldn't check), never "not
 * found". Definite answers also go into the in-memory holdings store, so the
 * shelf and results agree with the book page. A "found" already in that
 * store for this exact book key (a search result's mark, or the shelf's
 * stored answer) shows at once while the check runs, with the catalog rows
 * the store has, and a check that fails or says otherwise does not take it
 * away. A find whose record link and rows are both known is not checked
 * again: the catalog is not asked twice for the same thing.
 *
 * `loaded` is false while the page still reads the book's details: no check
 * is started then, but one already running (the page drawn again) is kept.
 */
export function useLibraryAnswer(bookKey: string | null | undefined, loaded = true): LibraryCardModel {
  const { state, library, loadingLibrary, libraryError, retryLibrary } = useLibrary();
  const store = useHoldingsStore();
  useSyncExternalStore(store.subscribe, store.version, store.version);
  const libraryId = state.selectedLibraryId;
  const ready = Boolean(libraryId && library?.id === libraryId);
  const checkable = ready && Boolean(library?.capabilities.publicAvailability);
  const [, redraw] = useReducer((value: number) => value + 1, 0);
  const [attempt, askAgain] = useReducer((value: number) => value + 1, 0);
  const held = bookKey && store.libraryId() === libraryId ? bookKey : null;
  const recordUrl = checkable && held ? store.recordUrl(held) : undefined;
  const rows = held ? store.matches(held) : undefined;
  const complete = Boolean(recordUrl && rows);
  const open = checksOf(store), key = libraryId && bookKey ? holdingsKey(libraryId, bookKey) : '';

  // A library whose catalog the app cannot read is still asked: the server
  // answers at once from what it has stored, else "unknown", with a link
  // that searches its catalog for this book.
  useEffect(() => {
    if (!bookKey || !libraryId || !ready || complete || (!loaded && !open.has(key))) return;
    return holdCheck(store, libraryId, bookKey, checkable, redraw);
  }, [bookKey, libraryId, ready, checkable, complete, loaded, attempt, store, open, key]);

  if (!libraryId) return { kind: 'none' };
  const cached = readReaderPreferences().selectedLibrary;
  const name = ready ? library!.name : cached?.id === libraryId ? cached.name : '';
  const homeUrl = ready ? webLink(library!.catalogUrl) : undefined;
  if (!ready) {
    if (libraryError && !loadingLibrary) return { kind: 'library', answer: 'unknown', name: name || 'Your library', retry: retryLibrary };
    return { kind: 'library', answer: 'checking', name, slowCatalog: true };
  }
  const current = open.get(key)?.reply || null;
  const catalogUrl = recordUrl || current?.catalogUrl || homeUrl;
  const link = catalogUrl ? { catalogUrl, catalogLinkKind: recordUrl ? 'record' as const : current?.catalogLinkKind } : {};
  const place = library?.city || library?.region || undefined;
  const known = held && store.get(held) === 'found';
  // The check's own rows, else those the store has for this book.
  const shown = current?.answer === 'found' && current.matches?.length ? current.matches : known ? rows : undefined;
  const matches = shown?.length ? { matches: shown } : {};
  // A check that fails or says otherwise never hides a known "found".
  if (known && (recordUrl || current?.answer !== 'found')) return { kind: 'library', answer: 'found', name, place, ...link, ...matches };
  // A library whose catalog the app cannot read: couldn't check (unless an
  // answer was stored), and trying again would not help.
  if (!checkable && current?.answer !== 'found' && current?.answer !== 'not_found') return { kind: 'library', answer: 'unsupported', name, ...link };
  if (!current) return { kind: 'library', answer: 'checking', name, slowCatalog: slowCatalog(library), ...link };
  // Trying again helps a check that ran out of time or found the catalog busy,
  // not a library that does not allow checks or a catalog we cannot read yet.
  const retry = () => { open.delete(key); askAgain(); };
  const lasting = current.reason === 'blocked' || current.reason === 'unsupported' || current.reason === 'unrecognized' || current.reason === 'configuration';
  return { kind: 'library', answer: current.answer, name, place, ...link, ...(current.reason ? { reason: current.reason } : {}),
    ...matches,
    ...(current.answer === 'unknown' && !lasting ? { retry } : {}) };
}
