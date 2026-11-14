import { useEffect, useMemo, useRef, useState } from 'react';
import type { RecentBook } from '../types';
import { pickSuggestions, type SuggestedBook } from './pickSuggestions';
import { SEED_SUGGESTIONS } from './seed';

/** What a source may use to choose its books. */
export type SuggestionContext = { savedBooks: readonly RecentBook[]; libraryId: string | null };

/**
 * A source of suggestions, asked again on each refresh. Sources come before
 * the bundled seed list, in this order. A source that fails keeps the books
 * it last gave (plan Part 2, edge case 1); it never empties the shelf.
 */
export type SuggestionSource = {
  id: string;
  load: (context: SuggestionContext, signal: AbortSignal) => Promise<readonly SuggestedBook[]>;
};

/**
 * Sources ahead of the seed list. Step B adds the server's (books known to be
 * in the chosen library, then books related to what the reader viewed or
 * saved) here; until then the seed list is the only source.
 */
export const SUGGESTION_SOURCES: readonly SuggestionSource[] = [];

// The last answers of each source, for this page load (one visit) only: in
// memory, never in browser storage, and not saved to the account.
let visit: { refresh: string | null; loaded: Readonly<Record<string, readonly SuggestedBook[]>> } = { refresh: null, loaded: {} };

/** Tests: start a new visit. */
export function forgetSuggestionVisit() {
  visit = { refresh: null, loaded: {} };
}

/**
 * When suggestions refresh (plan, "Points decided by recommendation"): a book
 * saved or removed, the library changed, or a new visit. Nothing else, so the
 * shelf does not move while someone is choosing.
 */
export function suggestionRefreshKey(savedBooks: readonly Pick<RecentBook, 'bookKey'>[], libraryId: string | null): string {
  return (libraryId || '') + '\n' + savedBooks.map(book => book.bookKey).sort().join('\n');
}

/**
 * The five suggestions for the shelf: the sources' latest books, then the
 * seed list, picked by `pickSuggestions`. A saved book leaves the suggestions
 * at once and the next one takes its place at the end; sources are asked
 * again in the background and fill in when they answer.
 */
export function useShelfSuggestions(savedBooks: readonly RecentBook[], libraryId: string | null, sources: readonly SuggestionSource[] = SUGGESTION_SOURCES): SuggestedBook[] {
  const refresh = suggestionRefreshKey(savedBooks, libraryId);
  const [loaded, setLoaded] = useState(() => visit.loaded);
  const context = useRef<SuggestionContext>({ savedBooks, libraryId });
  context.current = { savedBooks, libraryId };
  useEffect(() => {
    if (!sources.length || visit.refresh === refresh) return;
    const controller = new AbortController();
    void Promise.allSettled(sources.map(source => source.load(context.current, controller.signal))).then(results => {
      if (controller.signal.aborted) return;
      const next = { ...visit.loaded };
      results.forEach((result, index) => { if (result.status === 'fulfilled' && Array.isArray(result.value)) next[sources[index].id] = result.value; });
      visit = { refresh, loaded: next };
      setLoaded(next);
    });
    return () => controller.abort();
  }, [refresh, sources]);
  return useMemo(() => pickSuggestions([...sources.map(source => loaded[source.id] || []), SEED_SUGGESTIONS], savedBooks),
    [sources, loaded, savedBooks]);
}
