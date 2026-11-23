import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { RecentBook } from '../types';
import { pickSuggestions, type SuggestedBook } from './pickSuggestions';
import { seedFor } from './seed';
import { serverSuggestions } from './serverSource';

/**
 * What a source may use to choose its books: the saved books, Viewed before
 * (`recentBooks`, read when a refresh starts), the chosen library and the
 * seed list that stands last for it (`seed`, by the library's country;
 * seedFor in seed.ts).
 */
export type SuggestionContext = { savedBooks: readonly RecentBook[]; recentBooks?: readonly RecentBook[]; libraryId: string | null;
  seed?: readonly SuggestedBook[] };

/**
 * A source of suggestions, asked again on each refresh. Sources come before
 * the bundled seed list, in this order. A source that fails keeps the books
 * it last gave (plan Part 2, edge case 1); it never empties the shelf.
 * `wanted` says whether it could add anything for this context: when it
 * cannot, it is not asked and gives nothing. `previous` is what it last gave
 * in this visit.
 */
export type SuggestionSource = {
  id: string;
  wanted?: (context: SuggestionContext) => boolean;
  load: (context: SuggestionContext, signal: AbortSignal, previous: readonly SuggestedBook[]) => Promise<readonly SuggestedBook[]>;
};

/**
 * Sources ahead of the seed list: the server's (books related to what the
 * reader viewed or saved, cached lists per book; those the chosen library is
 * known to have first).
 */
export const SUGGESTION_SOURCES: readonly SuggestionSource[] = [serverSuggestions];

/** How long the first refresh of a visit may keep the suggestion slots empty before the seed list stands in. */
export const SUGGESTION_HOLD_MS = 1_500;

// This page load (one visit), in memory only: never in browser storage, and
// not saved to the account.
type Visit = Readonly<{
  /** The refresh whose answers `loaded` holds; null before the first. */
  refresh: string | null;
  /** The last answers of each source. */
  loaded: Readonly<Record<string, readonly SuggestedBook[]>>;
  /**
   * `waiting`: nothing has been drawn in the suggestion slots yet;
   * `late`: the seed list stands in for a first answer still on its way;
   * `settled`: every later refresh replaces the books as it answers.
   */
  phase: 'waiting' | 'late' | 'settled';
  /** Refresh results this visit. */
  result: number;
  /** The result that replaced the seed list shown for a late answer: it is drawn without motion. */
  quiet: number;
}>;
const newVisit = (): Visit => ({ refresh: null, loaded: {}, phase: 'waiting', result: 0, quiet: 0 });
let visit = newVisit();
// Also per visit, but they never change what is drawn: when the hold ends,
// the refresh the slots were last held for (only its answer can find the
// seed list standing in) and whether the reader has touched a suggestion.
let hold: { until: number | null; first: string | null } = { until: null, first: null };
let interacted = false;
const listeners = new Set<() => void>();
function update(next: Partial<Visit>) {
  visit = { ...visit, ...next };
  for (const listener of [...listeners]) listener();
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const currentVisit = () => visit;

/** Tests: start a new visit. */
export function forgetSuggestionVisit() {
  hold = { until: null, first: null };
  interacted = false;
  update(newVisit());
}

/**
 * The reader focused or pressed a suggestion. From then on, a first answer
 * that arrives after the seed list stood in for it is not taken, so the books
 * do not change under the reader's finger or keyboard.
 */
export function noteSuggestionInteraction() {
  interacted = true;
}

/**
 * When suggestions refresh (plan, "Points decided by recommendation"): a book
 * saved or removed, the library changed, its seed list changed (the US list
 * for a US library, `seedGroup` 'US'), or a new visit. Nothing else, so the
 * shelf does not move while someone is choosing.
 */
export function suggestionRefreshKey(savedBooks: readonly Pick<RecentBook, 'bookKey'>[], libraryId: string | null, seedGroup: string | null = null): string {
  return (libraryId || '') + (seedGroup ? '\u0000' + seedGroup : '') + '\n' + savedBooks.map(book => book.bookKey).sort().join('\n');
}

export type ShelfSuggestions = {
  /** The books for the suggestion slots (five unless every source runs out); none while `held`. */
  books: SuggestedBook[];
  /** The first answer of the visit is awaited: the slots stay empty, with no placeholder text. */
  held: boolean;
  /** These books replaced the seed list shown for a late first answer: no motion for that change. */
  quiet: boolean;
  /** Which refresh result these books are (0 before the first). */
  result: number;
};

const wantedBy = (source: SuggestionSource, context: SuggestionContext) => (source.wanted ? source.wanted(context) : true);

/**
 * The suggestions for the shelf: the sources' latest books, then the seed
 * list for the chosen library's country (`seedCountry`: the library's
 * country, null for none or unknown), picked by `pickSuggestions`. While the
 * chosen library is still loading (`countryPending`) nothing is asked and
 * the slots are held empty, so a US reader never sees the Indian list first.
 *
 * The first refresh of a visit: when no source could add anything (no chosen
 * library and no recent books), the seed list shows at once and nothing is
 * asked. Otherwise the slots are held empty until the first answer or
 * SUGGESTION_HOLD_MS, whichever comes first; after that the seed list stands
 * in, and an answer arriving later is taken (without motion) only if the
 * reader has not focused or pressed a suggestion yet.
 *
 * Later refreshes: a saved book leaves the suggestions at once and the next
 * one takes its place at the end; sources are asked again in the background
 * and fill in when they answer. A newer refresh aborts the one still
 * running, and an aborted refresh changes and counts nothing; a refresh that
 * fails keeps the last answer. Viewing a book changes `recentBooks` but is
 * not a refresh.
 */
export function useShelfSuggestions(savedBooks: readonly RecentBook[], libraryId: string | null, sources: readonly SuggestionSource[] = SUGGESTION_SOURCES,
  recentBooks: readonly RecentBook[] = [], seedCountry: string | null = null, countryPending = false): ShelfSuggestions {
  const pending = countryPending;
  const seed = seedFor(seedCountry);
  const refresh = suggestionRefreshKey(savedBooks, libraryId, seedCountry === 'US' ? 'US' : null);
  const state = useSyncExternalStore(subscribe, currentVisit, currentVisit);
  const context = useRef<SuggestionContext>({ savedBooks, recentBooks, libraryId, seed });
  context.current = { savedBooks, recentBooks, libraryId, seed };
  useEffect(() => {
    // The chosen library is still loading: its seed list is not known yet.
    if (pending) return;
    if (visit.refresh === refresh) return;
    const asking = context.current;
    const asked = sources.filter(source => wantedBy(source, asking));
    // A source with nothing to add gives nothing for this refresh.
    const loadedFor = () => ({ ...visit.loaded, ...Object.fromEntries(sources.filter(source => !asked.includes(source)).map(source => [source.id, []])) });
    if (!asked.length) {
      update({ refresh, loaded: loadedFor(), phase: 'settled', result: visit.result + 1 });
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (visit.phase === 'waiting') {
      hold = { until: hold.until ?? Date.now() + SUGGESTION_HOLD_MS, first: refresh };
      timer = setTimeout(() => { if (visit.phase === 'waiting') update({ phase: 'late' }); }, Math.max(0, hold.until! - Date.now()));
    }
    void Promise.allSettled(asked.map(source => source.load(asking, controller.signal, visit.loaded[source.id] || []))).then(results => {
      if (controller.signal.aborted) return;
      clearTimeout(timer);
      const result = visit.result + 1;
      // A later refresh (a book saved or removed, the library changed) is taken as usual.
      const late = visit.phase === 'late' && hold.first === refresh;
      // The reader is already choosing from the seed list: it stays.
      if (late && interacted) { update({ refresh, phase: 'settled', result }); return; }
      const loaded: Record<string, readonly SuggestedBook[]> = loadedFor();
      results.forEach((answer, index) => { if (answer.status === 'fulfilled' && Array.isArray(answer.value)) loaded[asked[index].id] = answer.value; });
      update({ refresh, loaded, phase: 'settled', result, quiet: late ? result : visit.quiet });
    });
    return () => { controller.abort(); clearTimeout(timer); };
  }, [refresh, sources, pending]);
  const held = state.phase === 'waiting' && state.refresh !== refresh && (pending || sources.some(source => wantedBy(source, context.current)));
  const books = useMemo(() => (held ? [] : pickSuggestions([...sources.map(source => state.loaded[source.id] || []), seed], savedBooks)),
    [held, sources, state.loaded, savedBooks, seed]);
  return { books, held, quiet: state.quiet > 0 && state.quiet === state.result, result: state.result };
}
