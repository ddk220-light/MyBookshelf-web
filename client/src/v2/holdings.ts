// In-memory library answers for the one-shelf screens (plan 3.3). Nothing here
// is written to browser storage, and no search text is kept: entries are keyed
// only by library and book. Answers are cleared whenever the chosen library
// changes. Later phases feed this from /holdings/lookup (shelf),
// /holdings/search (results) and /holdings/check (book page).
import { createContext, createElement, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

export type HoldingsAnswer = 'found' | 'not_found' | 'unconfirmed' | 'unknown' | 'checking';
const ANSWERS: ReadonlySet<string> = new Set(['found', 'not_found', 'unconfirmed', 'unknown', 'checking']);

export function holdingsKey(libraryId: string, bookKey: string): string {
  return libraryId + '|' + bookKey;
}

export type HoldingsStore = {
  /** The library whose answers the store holds, or null when none is chosen. */
  libraryId: () => string | null;
  /** Switches library; answers for any other library are dropped. */
  setLibrary: (libraryId: string | null) => void;
  get: (bookKey: string) => HoldingsAnswer | undefined;
  /** Records answers for the given library; ignored if that library is no longer chosen. */
  set: (libraryId: string, answers: Record<string, HoldingsAnswer>) => void;
  clear: () => void;
  subscribe: (listener: () => void) => () => void;
  version: () => number;
};

export function createHoldingsStore(initialLibraryId: string | null = null): HoldingsStore {
  let library = initialLibraryId;
  let answers = new Map<string, HoldingsAnswer>();
  let revision = 0;
  const listeners = new Set<() => void>();
  const changed = () => { revision += 1; for (const listener of [...listeners]) listener(); };
  return {
    libraryId: () => library,
    setLibrary(next) {
      if (next === library) return;
      library = next;
      if (answers.size) answers = new Map();
      changed();
    },
    get: (bookKey) => (library ? answers.get(holdingsKey(library, bookKey)) : undefined),
    set(libraryId, next) {
      if (!library || libraryId !== library) return;
      let updated = false;
      for (const [bookKey, answer] of Object.entries(next)) {
        if (!ANSWERS.has(answer)) continue;
        const key = holdingsKey(libraryId, bookKey);
        if (answers.get(key) === answer) continue;
        answers.set(key, answer);
        updated = true;
      }
      if (updated) changed();
    },
    clear() {
      if (!answers.size) return;
      answers = new Map();
      changed();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    version: () => revision,
  };
}

const HoldingsContext = createContext<HoldingsStore | null>(null);

/** Provides one store per mounted tree, cleared whenever `libraryId` changes. */
export function HoldingsProvider({ libraryId, children }: { libraryId: string | null; children: ReactNode }) {
  const [store] = useState(() => createHoldingsStore(libraryId));
  useEffect(() => { store.setLibrary(libraryId); }, [store, libraryId]);
  return createElement(HoldingsContext.Provider, { value: store }, children);
}

export function useHoldingsStore(): HoldingsStore {
  const store = useContext(HoldingsContext);
  if (!store) throw new Error('Library answers are unavailable.');
  return store;
}

/** The chosen library's answer for a book, or undefined when nothing is known yet. */
export function useHoldingsAnswer(bookKey: string): HoldingsAnswer | undefined {
  const store = useHoldingsStore();
  useSyncExternalStore(store.subscribe, store.version, store.version);
  return store.get(bookKey);
}
