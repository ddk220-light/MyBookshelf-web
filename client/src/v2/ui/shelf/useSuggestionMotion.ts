import { useEffect, useMemo, useState } from 'react';

export type SuggestionMotion = 'arriving' | 'solid';

/** How long the arriving and turning-solid animations run (home.css, `suggestion-*`). */
export const SUGGESTION_MOTION_MS = 600;
const NONE: ReadonlyMap<string, SuggestionMotion> = new Map();

// The suggestions last drawn in this page load (memory only), and the
// refresh result they came with. The shelf is drawn again when the reader
// comes back from a book page, so this outlives the shelf itself; on a new
// visit nothing moves.
let lastSuggested: ReadonlySet<string> | null = null;
let lastResult = 0;

/** Tests: start a new visit. */
export function forgetSuggestionMotion() {
  lastSuggested = null;
  lastResult = 0;
}

/**
 * Motion for the shelf suggestions (SuggestShelf and DeskSuggestShelf
 * boards): a suggestion that was not on the shelf the last time it was drawn
 * fades in ('arriving'), and a saved book that was a suggestion then turns
 * solid ('solid'). Each change plays once: the marks are dropped when the
 * animation has run, so drawing the same shelf again (back from search
 * results, another view) moves nothing.
 *
 * Nothing moves for the first suggestions of a visit, while the slots are
 * held (`suggestedKeys` null), or for the change a `quiet` result makes (the
 * first answer replacing the seed list shown while it was late). Reduced
 * motion is handled in home.css (no animation).
 */
export function useSuggestionMotion(suggestedKeys: readonly string[] | null, savedKeys: readonly string[],
  { result = 0, quiet = false }: { result?: number; quiet?: boolean } = {}): ReadonlyMap<string, SuggestionMotion> {
  const suggested = suggestedKeys ? suggestedKeys.join('\n') : null;
  const saved = savedKeys.join('\n');
  const marks = useMemo(() => {
    const before = lastSuggested;
    const found = new Map<string, SuggestionMotion>();
    if (!suggestedKeys || !before || (quiet && result !== lastResult)) return found;
    for (const key of suggestedKeys) if (!before.has(key)) found.set(key, 'arriving');
    for (const key of savedKeys) if (before.has(key)) found.set(key, 'solid');
    return found;
    // The joined keys stand for the two lists. A new result that leaves them
    // as they are changes nothing, so a change still playing is not cut short.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggested, saved]);
  useEffect(() => {
    if (!suggestedKeys) return;
    lastSuggested = new Set(suggestedKeys);
    lastResult = result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggested, result]);
  const [played, setPlayed] = useState<ReadonlyMap<string, SuggestionMotion> | null>(null);
  useEffect(() => {
    if (!marks.size) return;
    const timer = setTimeout(() => setPlayed(marks), SUGGESTION_MOTION_MS + 100);
    return () => clearTimeout(timer);
  }, [marks]);
  return marks.size && played !== marks ? marks : NONE;
}
