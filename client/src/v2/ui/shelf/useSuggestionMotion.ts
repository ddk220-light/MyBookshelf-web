import { useEffect, useMemo } from 'react';

export type SuggestionMotion = 'arriving' | 'solid';

// The suggestions last drawn in this page load (memory only). The shelf is
// drawn again when the reader comes back from a book page, so this outlives
// the shelf itself; on a new visit nothing moves.
let lastSuggested: ReadonlySet<string> | null = null;

/** Tests: start a new visit. */
export function forgetSuggestionMotion() {
  lastSuggested = null;
}

/**
 * Motion for the shelf suggestions (SuggestShelf and DeskSuggestShelf
 * boards): a suggestion that was not on the shelf the last time it was drawn
 * fades in ('arriving'), and a saved book that was a suggestion then turns
 * solid ('solid'). The first shelf of a visit appears without motion.
 * Reduced motion is handled in home.css (no animation).
 */
export function useSuggestionMotion(suggestedKeys: readonly string[], savedKeys: readonly string[]): ReadonlyMap<string, SuggestionMotion> {
  const suggested = suggestedKeys.join('\n');
  const saved = savedKeys.join('\n');
  const motion = useMemo(() => {
    const before = lastSuggested;
    const result = new Map<string, SuggestionMotion>();
    if (!before) return result;
    for (const key of suggestedKeys) if (!before.has(key)) result.set(key, 'arriving');
    for (const key of savedKeys) if (before.has(key)) result.set(key, 'solid');
    return result;
    // The joined keys stand for the two lists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggested, saved]);
  useEffect(() => { lastSuggested = new Set(suggestedKeys); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [suggested]);
  return motion;
}
