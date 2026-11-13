import { useEffect, useState } from 'react';
import { publicApi } from '../../api';
import { useHoldingsStore, type HoldingsStore } from '../../holdings';
import { workIdOf } from '../../searchGroups';
import type { ResultEntry } from './searchResults';

/** The server sends at most 12 books per background check (plan 3.5). */
export const MARK_BOOK_LIMIT = 12;
/** The server ends the stream by 25 s; the client gives up a little later. */
export const MARKS_TIMEOUT_MS = 30_000;
const MAX_QUERY_LENGTH = 160;

type MarksApi = Pick<typeof publicApi, 'holdingsSearch'>;

/**
 * The records whose "found" marks a result card: its own record, and other
 * records in its display group only when they carry the same Open Library
 * work ID. A card that groups different works never takes their marks.
 */
export function entryMarkKeys(entry: Pick<ResultEntry, 'key' | 'kind' | 'state' | 'alternatives'>): string[] {
  if (entry.kind !== 'book') return [];
  const book = (entry.state as { book?: { bookKey: string; workId?: string } } | undefined)?.book;
  const work = book ? workIdOf(book) : null;
  const same = work ? (entry.alternatives || []).filter(version => version.bookKey !== entry.key && workIdOf(version) === work).map(version => version.bookKey) : [];
  return [entry.key, ...same];
}

/** True when the chosen library has marked the card (any record of its work). */
export function isMarked(store: Pick<HoldingsStore, 'get'>, entry: Pick<ResultEntry, 'key' | 'kind' | 'state' | 'alternatives'>): boolean {
  return entryMarkKeys(entry).some(key => store.get(key) === 'found');
}

/**
 * The book keys sent with one background check: every card's own record
 * first (in the order shown), then other records of the same work, twelve
 * at most.
 */
export function markBookKeys(entries: readonly ResultEntry[], limit = MARK_BOOK_LIMIT): string[] {
  const keys = new Set<string>();
  for (const entry of entries) if (entry.kind === 'book' && keys.size < limit) keys.add(entry.key);
  for (const entry of entries) for (const key of entryMarkKeys(entry).slice(1)) if (keys.size < limit) keys.add(key);
  return [...keys];
}

// Which results have had their check started, by the search's opaque ID and
// the library it was started for. Same-tab memory only, never search text.
// Coming back to the same results (Back from a book) does not start it again;
// the marks already received are in the holdings store.
const started = new Map<string, string>();
const MAX_STARTED = 40;
export function forgetLibraryMarks() { started.clear(); }

type Run = { candidateId: string; libraryId: string; status: 'checking' | 'done' | 'failed' };

/**
 * The background check for search results (plan 5.7, POST /holdings/search):
 * once per set of results and chosen library, while `active`. Marks go into
 * the in-memory holdings store as they arrive, so the cards, the saved shelf
 * and the book page agree. The request is aborted when the results stop being
 * active (a new search, clear, a book opened, the screen left) or the library
 * changes; a changed library checks the open results again. Any failure only
 * ends the check: marks already shown stay, and nothing reads as "not found".
 * The typed text is sent with the request and kept nowhere else.
 */
export function useLibraryMarks({ active, libraryId, candidateId, entries, query, api = publicApi }: {
  active: boolean; libraryId: string | null; candidateId: string | null; entries: readonly ResultEntry[]; query: string; api?: MarksApi;
}): { checking: boolean } {
  const store = useHoldingsStore();
  const [run, setRun] = useState<Run | null>(null);
  const keys = markBookKeys(entries);
  const wanted = keys.join('\n');
  const text = query.trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH).trim();

  useEffect(() => {
    if (!active || !libraryId || !candidateId || !keys.length || !text) return;
    if (started.get(candidateId) === libraryId) return;
    const controller = new AbortController();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    // Started on the next task, so a mount that is undone at once (React's
    // development double effects) sends nothing.
    const begin = setTimeout(() => {
      started.delete(candidateId);
      started.set(candidateId, libraryId);
      while (started.size > MAX_STARTED) started.delete(started.keys().next().value as string);
      setRun({ candidateId, libraryId, status: 'checking' });
      deadline = setTimeout(() => controller.abort(), MARKS_TIMEOUT_MS);
      const finish = (status: Run['status']) => {
        clearTimeout(deadline);
        setRun(current => current?.candidateId === candidateId && current.libraryId === libraryId ? { ...current, status } : current);
      };
      api.holdingsSearch(libraryId, text, keys, bookKey => store.set(libraryId, { [bookKey]: 'found' }), controller.signal)
        .then(() => finish('done'), () => finish('failed'));
    }, 0);
    return () => { clearTimeout(begin); clearTimeout(deadline); controller.abort(); };
    // `wanted` stands for `keys`.
  }, [active, libraryId, candidateId, wanted, text, store, api]);

  const checking = Boolean(active && run && run.status === 'checking' && run.candidateId === candidateId && run.libraryId === libraryId);
  return { checking };
}
