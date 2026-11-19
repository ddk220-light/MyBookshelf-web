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
 * visit: again only for a newly saved book, after the library changes, or,
 * when the reader comes back to the shelf, for a book still without an answer
 * (a check that finished in the background has stored its answer by then);
 * `behind` is true while the shelf is drawn behind an open page. Any
 * failure leaves the books without an answer: no badge, and never "not found".
 */
export function useShelfHoldings(libraryId: string | null, books: readonly RecentBook[], behind = false) {
  const store = useHoldingsStore();
  const mounted = useRef(false);
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
  // Coming back to the shelf (from a book page): a check that had not
  // answered may have finished since and stored its answer. Ask once more,
  // once per return, for the books with no answer or "couldn't check". On
  // phones the shelf is drawn again (mount); at 640 px and wider it stays
  // mounted behind the open page, so its return is `behind` turning false.
  // A book whose lookup is still on its way is not asked about twice.
  const wasBehind = useRef(behind);
  useEffect(() => {
    const returning = wasBehind.current && !behind;
    wasBehind.current = behind;
    if (!returning && mounted.current) return;
    mounted.current = true;
    const asked = askedByStore.get(store);
    if (!asked || asked.libraryId !== libraryId) return;
    const waiting = new Set<string>();
    for (const flight of inFlight.current) for (const key of flight.keys) waiting.add(key);
    for (const key of [...asked.keys]) {
      if (waiting.has(key)) continue;
      const answer = store.get(key);
      if (answer === undefined || answer === 'unknown' || answer === 'checking') asked.keys.delete(key);
    }
    // Only when the shelf is drawn again or comes back in front, not when its
    // books or library change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [behind]);
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
    // `wanted` stands for the list of saved book keys, so `books` is not a
    // dependency; `behind` is one so a return asks for what it forgot.
  }, [libraryId, wanted, store, behind]);
}
