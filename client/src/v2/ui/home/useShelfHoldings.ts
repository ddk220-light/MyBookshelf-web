import { useEffect, useRef } from 'react';
import { publicApi } from '../../api';
import { useHoldingsStore, type HoldingsStore } from '../../holdings';
import type { RecentBook } from '../../types';

const BATCH = 100;

// What each holdings store (one per mounted tree, so per visit and identity)
// has already been asked about, so the shelf drawn again after a book page
// does not ask again. A book page puts its fresh answer in the store itself.
const askedByStore = new WeakMap<HoldingsStore, { libraryId: string | null; keys: Set<string> }>();

/**
 * Asks for the chosen library's stored answers for the saved books (plan 3.5,
 * POST /holdings/lookup: database only, no catalog request) and puts them in
 * the in-memory holdings store. Each book is asked about once per library per
 * visit: again only for a newly saved book or after the library changes. Any
 * failure leaves the books without an answer: no badge, and never "not found".
 */
export function useShelfHoldings(libraryId: string | null, books: readonly RecentBook[]) {
  const store = useHoldingsStore();
  const controller = useRef<AbortController | null>(null);
  const inFlight = useRef(new Set<{ seen: Set<string>; keys: Set<string> }>());
  const wanted = books.map(book => book.bookKey).join('\n');
  // Leaving before an answer came (the shelf was closed): forget those books so
  // the shelf asks again when it is drawn.
  useEffect(() => () => {
    for (const { seen, keys } of inFlight.current) for (const key of keys) seen.delete(key);
    inFlight.current.clear();
    controller.current?.abort();
    controller.current = null;
  }, []);
  useEffect(() => {
    if (!libraryId) return;
    let asked = askedByStore.get(store);
    if (!asked || asked.libraryId !== libraryId) {
      controller.current?.abort();
      controller.current = null;
      asked = { libraryId, keys: new Set() };
      askedByStore.set(store, asked);
    }
    const seen = asked.keys;
    const pending = books.filter(book => !seen.has(book.bookKey));
    if (!pending.length) return;
    for (const book of pending) seen.add(book.bookKey);
    controller.current ??= new AbortController();
    const signal = controller.current.signal;
    for (let index = 0; index < pending.length; index += BATCH) {
      const batch = pending.slice(index, index + BATCH);
      const keys = new Set(batch.map(book => book.bookKey));
      const flight = { seen, keys };
      inFlight.current.add(flight);
      publicApi.holdingsLookup(libraryId, batch.map(book => ({ bookKey: book.bookKey, ...(book.isbn13 ? { isbn13: book.isbn13 } : {}) })), signal)
        .then(answers => store.set(libraryId, Object.fromEntries(Object.entries(answers).filter(([bookKey]) => keys.has(bookKey)))))
        .catch(() => { /* No answer: no badge. Asked again on the next visit. */ })
        .finally(() => { inFlight.current.delete(flight); });
    }
    // `wanted` stands for the list of saved book keys, so `books` is not a dependency.
  }, [libraryId, wanted, store]);
}
