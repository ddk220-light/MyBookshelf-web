import { useEffect, useRef } from 'react';
import { publicApi } from '../../api';
import { useHoldingsStore } from '../../holdings';
import type { RecentBook } from '../../types';

const BATCH = 100;

/**
 * Asks for the chosen library's stored answers for the saved books (plan 3.5,
 * POST /holdings/lookup: database only, no catalog request) and puts them in
 * the in-memory holdings store. Each book is asked about once per library per
 * page load. Any failure leaves the books without an answer: no badge, and
 * never "not found".
 */
export function useShelfHoldings(libraryId: string | null, books: readonly RecentBook[]) {
  const store = useHoldingsStore();
  const asked = useRef<{ libraryId: string | null; keys: Set<string> }>({ libraryId: null, keys: new Set() });
  const controller = useRef<AbortController | null>(null);
  const wanted = books.map(book => book.bookKey).join('\n');
  // Declared before the lookup effect so that, on a remount, its cleanup has
  // already forgotten what was asked and the lookup runs again.
  useEffect(() => () => {
    controller.current?.abort();
    controller.current = null;
    asked.current = { libraryId: null, keys: new Set() };
  }, []);
  useEffect(() => {
    if (!libraryId) return;
    if (asked.current.libraryId !== libraryId) {
      controller.current?.abort();
      controller.current = null;
      asked.current = { libraryId, keys: new Set() };
    }
    const seen = asked.current.keys;
    const pending = books.filter(book => !seen.has(book.bookKey));
    if (!pending.length) return;
    for (const book of pending) seen.add(book.bookKey);
    controller.current ??= new AbortController();
    const signal = controller.current.signal;
    for (let index = 0; index < pending.length; index += BATCH) {
      const batch = pending.slice(index, index + BATCH);
      const keys = new Set(batch.map(book => book.bookKey));
      publicApi.holdingsLookup(libraryId, batch.map(book => ({ bookKey: book.bookKey, ...(book.isbn13 ? { isbn13: book.isbn13 } : {}) })), signal)
        .then(answers => store.set(libraryId, Object.fromEntries(Object.entries(answers).filter(([bookKey]) => keys.has(bookKey)))))
        .catch(() => { /* No answer: no badge. Asked again on the next page load. */ });
    }
    // `wanted` stands for the list of saved book keys, so `books` is not a dependency.
  }, [libraryId, wanted, store]);
}
