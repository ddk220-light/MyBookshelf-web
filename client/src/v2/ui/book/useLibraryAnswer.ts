import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { publicApi, webLink, type HoldingsCheck } from '../../api';
import { useLibrary } from '../../context';
import { useHoldingsStore } from '../../holdings';
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

type Result = HoldingsCheck & { libraryId: string; bookKey: string; attempt: number };

/**
 * The chosen library's answer for one book (plan 3.5, POST /holdings/check):
 * the stored answer, else one live check. The answer is held together with
 * the library and the exact book key it was asked for, so it is never shown
 * for another book or edition, or after the library changes. Any failure,
 * time-out or unreadable reply is "unknown" (couldn't check), never "not
 * found". Definite answers also go into the in-memory holdings store, so the
 * shelf and results agree with the book page. A "found" already in that
 * store for this exact book key (a search result's mark, or the shelf's
 * stored answer) shows at once while the check runs, and a check that fails
 * does not take it away.
 */
export function useLibraryAnswer(bookKey: string | null | undefined): LibraryCardModel {
  const { state, library, loadingLibrary, libraryError, retryLibrary } = useLibrary();
  const store = useHoldingsStore();
  useSyncExternalStore(store.subscribe, store.version, store.version);
  const libraryId = state.selectedLibraryId;
  const ready = Boolean(libraryId && library?.id === libraryId);
  const checkable = ready && Boolean(library?.capabilities.publicAvailability);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const recordUrl = checkable && bookKey && store.libraryId() === libraryId ? store.recordUrl(bookKey) : undefined;

  // A library whose catalog the app cannot read is still asked: the server
  // answers at once from what it has stored, else "unknown", with a link
  // that searches its catalog for this book.
  useEffect(() => {
    if (!bookKey || !libraryId || !ready || recordUrl) return;
    let active = true;
    let timedOut = false;
    const controller = new AbortController();
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, CHECK_TIMEOUT_MS);
    const settle = (reply: HoldingsCheck) => {
      if (!active) return;
      setResult({ libraryId, bookKey, attempt, ...reply });
      if (checkable) store.set(libraryId, { [bookKey]: reply.answer }, reply.answer === 'found' && reply.catalogUrl && reply.catalogLinkKind === 'record' ? { [bookKey]: reply.catalogUrl } : undefined);
    };
    publicApi.holdingsCheck(libraryId, bookKey, controller.signal)
      .then(settle)
      .catch(() => { if (timedOut || !controller.signal.aborted) settle(timedOut ? { answer: 'unknown', reason: 'timeout' } : { answer: 'unknown' }); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [bookKey, libraryId, ready, checkable, recordUrl, attempt, store]);

  if (!libraryId) return { kind: 'none' };
  const cached = readReaderPreferences().selectedLibrary;
  const name = ready ? library!.name : cached?.id === libraryId ? cached.name : '';
  const homeUrl = ready ? webLink(library!.catalogUrl) : undefined;
  if (!ready) {
    if (libraryError && !loadingLibrary) return { kind: 'library', answer: 'unknown', name: name || 'Your library', retry: retryLibrary };
    return { kind: 'library', answer: 'checking', name, slowCatalog: true };
  }
  const current = result && result.libraryId === libraryId && result.bookKey === bookKey && result.attempt === attempt ? result : null;
  const catalogUrl = recordUrl || current?.catalogUrl || homeUrl;
  const link = catalogUrl ? { catalogUrl, catalogLinkKind: recordUrl ? 'record' as const : current?.catalogLinkKind } : {};
  const place = library?.city || library?.region || undefined;
  const known = bookKey && store.libraryId() === libraryId && store.get(bookKey) === 'found';
  // A check that could not tell (unknown, unconfirmed) never hides a proven "found".
  if (recordUrl || (known && (!current || current.answer === 'unknown' || current.answer === 'unconfirmed'))) return { kind: 'library', answer: 'found', name, place, ...link };
  // A library whose catalog the app cannot read: couldn't check (unless an
  // answer was stored), and trying again would not help.
  if (!checkable && current?.answer !== 'found' && current?.answer !== 'not_found') return { kind: 'library', answer: 'unsupported', name, ...link };
  if (!current) return { kind: 'library', answer: 'checking', name, slowCatalog: slowCatalog(library), ...link };
  // Trying again helps a check that ran out of time or found the catalog busy,
  // not a library that does not allow checks or a catalog we cannot read yet.
  const lasting = current.reason === 'blocked' || current.reason === 'unsupported' || current.reason === 'unrecognized' || current.reason === 'configuration';
  return { kind: 'library', answer: current.answer, name, place, ...link, ...(current.reason ? { reason: current.reason } : {}),
    ...(current.answer === 'unknown' && !lasting ? { retry } : {}) };
}
