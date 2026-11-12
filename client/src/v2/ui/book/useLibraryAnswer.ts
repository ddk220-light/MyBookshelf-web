import { useCallback, useEffect, useState } from 'react';
import { publicApi, webLink } from '../../api';
import { useLibrary } from '../../context';
import { useHoldingsStore } from '../../holdings';
import { readReaderPreferences } from '../../readerState';

/**
 * The longest the book page waits for one check before saying it couldn't
 * check. The server's slowest live check ends at about 55 s, so the page
 * waits a little longer than that rather than cutting off a real answer.
 */
export const CHECK_TIMEOUT_MS = 60_000;

export type CardAnswer = 'checking' | 'found' | 'not_found' | 'unconfirmed' | 'unknown' | 'unsupported';
export type LibraryCardModel =
  | { kind: 'none' }
  | { kind: 'library'; answer: CardAnswer; name: string; catalogUrl?: string; retry?: () => void };

type Result = { libraryId: string; bookKey: string; attempt: number; answer: Exclude<CardAnswer, 'checking' | 'unsupported'>; catalogUrl?: string };

/**
 * The chosen library's answer for one book (plan 3.5, POST /holdings/check):
 * the stored answer, else one live check. The answer is held together with
 * the library and the exact book key it was asked for, so it is never shown
 * for another book or edition, or after the library changes. Any failure,
 * time-out or unreadable reply is "unknown" (couldn't check), never "not
 * found". Definite answers also go into the in-memory holdings store, so the
 * shelf and results agree with the book page.
 */
export function useLibraryAnswer(bookKey: string | null | undefined): LibraryCardModel {
  const { state, library, loadingLibrary, libraryError, retryLibrary } = useLibrary();
  const store = useHoldingsStore();
  const libraryId = state.selectedLibraryId;
  const ready = Boolean(libraryId && library?.id === libraryId);
  const checkable = ready && Boolean(library?.capabilities.publicAvailability);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  // A library whose catalog the app cannot read is still asked: the server
  // answers at once from what it has stored, else "unknown", with a link
  // that searches its catalog for this book.
  useEffect(() => {
    if (!bookKey || !libraryId || !ready) return;
    let active = true;
    let timedOut = false;
    const controller = new AbortController();
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, CHECK_TIMEOUT_MS);
    const settle = (answer: Result['answer'], catalogUrl?: string) => {
      if (!active) return;
      setResult({ libraryId, bookKey, attempt, answer, ...(catalogUrl ? { catalogUrl } : {}) });
      if (answer === 'found' || answer === 'not_found' || answer === 'unconfirmed') store.set(libraryId, { [bookKey]: answer });
    };
    publicApi.holdingsCheck(libraryId, bookKey, controller.signal)
      .then(reply => settle(reply.answer, reply.catalogUrl))
      .catch(() => { if (timedOut || !controller.signal.aborted) settle('unknown'); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [bookKey, libraryId, ready, attempt, store]);

  if (!libraryId) return { kind: 'none' };
  const cached = readReaderPreferences().selectedLibrary;
  const name = ready ? library!.name : cached?.id === libraryId ? cached.name : '';
  const homeUrl = ready ? webLink(library!.catalogUrl) : undefined;
  if (!ready) {
    if (libraryError && !loadingLibrary) return { kind: 'library', answer: 'unknown', name: name || 'Your library', retry: retryLibrary };
    return { kind: 'library', answer: 'checking', name };
  }
  const current = result && result.libraryId === libraryId && result.bookKey === bookKey && result.attempt === attempt ? result : null;
  const catalogUrl = current?.catalogUrl || homeUrl;
  const link = catalogUrl ? { catalogUrl } : {};
  // A library whose catalog the app cannot read: couldn't check (unless an
  // answer was stored), and trying again would not help.
  if (!checkable && current?.answer !== 'found' && current?.answer !== 'not_found') return { kind: 'library', answer: 'unsupported', name, ...link };
  if (!current) return { kind: 'library', answer: 'checking', name, ...link };
  return { kind: 'library', answer: current.answer, name, ...link, ...(current.answer === 'unknown' ? { retry } : {}) };
}
