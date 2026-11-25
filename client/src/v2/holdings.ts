// In-memory library answers for the one-shelf screens (plan 3.3). Nothing here
// is written to browser storage, and no search text is kept: entries are keyed
// only by library and book. Answers are cleared whenever the chosen library
// changes. Fed from /holdings/lookup (shelf), /holdings/search (results) and
// /holdings/check (book page).
import { createContext, createElement, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { CatalogMatch } from './api';

export type HoldingsAnswer = 'found' | 'not_found' | 'unconfirmed' | 'unknown' | 'checking';
const ANSWERS: ReadonlySet<string> = new Set(['found', 'not_found', 'unconfirmed', 'unknown', 'checking']);

export function holdingsLabel(answer: HoldingsAnswer | undefined): string | undefined {
  switch (answer) {
    case 'found': return 'In your library';
    case 'not_found': return 'Not in your library';
    case 'unknown':
    case 'unconfirmed': return 'Couldn’t check';
    default: return undefined;
  }
}

export function holdingsKey(libraryId: string, bookKey: string): string {
  return libraryId + '|' + bookKey;
}

export type HoldingsStore = {
  /** The library whose answers the store holds, or null when none is chosen. */
  libraryId: () => string | null;
  /** Switches library; answers for any other library are dropped. */
  setLibrary: (libraryId: string | null) => void;
  get: (bookKey: string) => HoldingsAnswer | undefined;
  recordUrl: (bookKey: string) => string | undefined;
  /** A found book's rows from the library's catalog: empty when a check gave none, undefined when none has been asked for. */
  matches: (bookKey: string) => CatalogMatch[] | undefined;
  /** Records answers for the given library; ignored if that library is no longer chosen. */
  set: (libraryId: string, answers: Record<string, HoldingsAnswer>, recordUrls?: Record<string, string>, matches?: Record<string, CatalogMatch[]>) => void;
  clear: () => void;
  subscribe: (listener: () => void) => () => void;
  version: () => number;
};

export function createHoldingsStore(initialLibraryId: string | null = null): HoldingsStore {
  let library = initialLibraryId;
  const answers = new Map<string, HoldingsAnswer>();
  const links = new Map<string, string>();
  const rows = new Map<string, CatalogMatch[]>();
  let revision = 0;
  const listeners = new Set<() => void>();
  const changed = () => { revision += 1; for (const listener of [...listeners]) listener(); };
  return {
    libraryId: () => library,
    setLibrary(next) {
      if (next === library) return;
      library = next;
      answers.clear();
      links.clear();
      rows.clear();
      changed();
    },
    get: (bookKey) => (library ? answers.get(holdingsKey(library, bookKey)) : undefined),
    recordUrl: (bookKey) => (library ? links.get(holdingsKey(library, bookKey)) : undefined),
    matches: (bookKey) => (library ? rows.get(holdingsKey(library, bookKey)) : undefined),
    set(libraryId, next, urls, matches) {
      if (!library || libraryId !== library) return;
      let updated = false;
      for (const [bookKey, answer] of Object.entries(next)) {
        if (!ANSWERS.has(answer)) continue;
        const key = holdingsKey(libraryId, bookKey);
        const previous = answers.get(key);
        // A find is never taken away (as in the server's store), and a check
        // that could not answer (unknown, unconfirmed) or has not answered
        // yet never replaces a proven answer.
        if (answer !== 'found' && (previous === 'found' || (previous === 'not_found' && answer !== 'not_found'))) continue;
        if (previous !== answer) { answers.set(key, answer); updated = true; }
        if (answer !== 'found') continue;
        const url = urls?.[bookKey];
        if (url && links.get(key) !== url) { links.set(key, url); updated = true; }
        // An answer without rows (a stored one keeps none) leaves known rows.
        const found = matches?.[bookKey];
        if (found && (found.length || !rows.has(key))) { rows.set(key, found); updated = true; }
      }
      if (updated) changed();
    },
    clear() {
      if (!answers.size) return;
      answers.clear();
      links.clear();
      rows.clear();
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
