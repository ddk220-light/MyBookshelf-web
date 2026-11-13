import { useCallback, useEffect, useRef, useState } from 'react';
import { PublicApiError, publicApi } from '../../api';
import { rememberCandidates, rememberShelfMatches } from '../../searchMemory';
import type { PublicBook, RecentBook } from '../../types';
import { ownMatches } from './searchResults';

export type SearchAnswer = { kind: 'exact'; book: PublicBook } | { kind: 'results'; id: string } | { kind: 'failed' };
type SearchApi = Pick<typeof publicApi, 'searchBooks'>;

const isAbort = (failure: unknown) => failure instanceof DOMException && failure.name === 'AbortError';

/**
 * One public book search (no library scope). An ISBN that resolves to one
 * book answers `exact`. Results are kept in same-tab memory (searchMemory)
 * under an opaque ID, with the saved books that matched. Offline, or when the
 * public book data fails, the answer is `failed`: a failure is never shown as
 * "No books found". Only a definite "no book" from the server is an empty
 * result. An aborted search throws AbortError.
 */
export async function runBookSearch(query: string, savedBooks: readonly RecentBook[], signal: AbortSignal, api: SearchApi = publicApi): Promise<SearchAnswer> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { kind: 'failed' };
  let candidates: PublicBook[] = [];
  try {
    const response = await api.searchBooks(query, signal);
    if (response.kind === 'exact') return { kind: 'exact', book: response.book };
    candidates = response.candidates;
    // Some sources did not answer and nothing came back: that is a failure.
    if (response.partial && !candidates.length) return { kind: 'failed' };
  } catch (failure) {
    if (signal.aborted || isAbort(failure)) throw failure;
    const definite = failure instanceof PublicApiError && (failure.code === 'BOOK_NOT_FOUND' || failure.code === 'INVALID_REQUEST');
    if (!definite) return { kind: 'failed' };
  }
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const id = rememberCandidates(candidates, query);
  rememberShelfMatches(id, ownMatches(savedBooks, query, candidates).map(book => book.bookKey));
  return { kind: 'results', id };
}

export type BookSearchStatus = 'idle' | 'searching' | 'failed' | 'done';

/**
 * The shelf's search: one request at a time; a newer search or cancel() aborts
 * the older one. `id` is the remembered results of the last finished search.
 */
export function useBookSearch(api: SearchApi = publicApi) {
  const [state, setState] = useState<{ status: BookSearchStatus; id: string | null; query: string }>({ status: 'idle', id: null, query: '' });
  const request = useRef<AbortController | null>(null);
  const apiRef = useRef(api);
  apiRef.current = api;
  useEffect(() => () => request.current?.abort(), []);

  const cancel = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setState({ status: 'idle', id: null, query: '' });
  }, []);

  const run = useCallback(async (query: string, savedBooks: readonly RecentBook[]): Promise<SearchAnswer | null> => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState(current => ({ ...current, status: 'searching', query }));
    try {
      const answer = await runBookSearch(query, savedBooks, controller.signal, apiRef.current);
      if (request.current !== controller) return null;
      request.current = null;
      // An exact answer leaves for the book page; the ghosts stay until then.
      if (answer.kind === 'results') setState({ status: 'done', id: answer.id, query });
      else if (answer.kind === 'failed') setState({ status: 'failed', id: null, query });
      return answer;
    } catch {
      if (request.current !== controller) return null;
      request.current = null;
      setState({ status: 'failed', id: null, query });
      return null;
    }
  }, []);

  return { ...state, run, cancel };
}
