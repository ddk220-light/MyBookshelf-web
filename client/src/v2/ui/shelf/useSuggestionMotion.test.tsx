import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { forgetSuggestionMotion, SUGGESTION_MOTION_MS, useSuggestionMotion } from './useSuggestionMotion';

type Props = { suggested: string[] | null; saved: string[]; result?: number; quiet?: boolean };
const draw = (initialProps: Props) => renderHook(({ suggested, saved, result = 1, quiet = false }: Props) => useSuggestionMotion(suggested, saved, { result, quiet }), { initialProps });
const marks = (map: ReadonlyMap<string, string>) => Object.fromEntries(map);

afterEach(() => { cleanup(); vi.useRealTimers(); forgetSuggestionMotion(); });

describe('suggestion motion', () => {
  it('the first suggestions of a visit, and held slots, do not move', () => {
    const shelf = draw({ suggested: null, saved: [] });
    expect(marks(shelf.result.current)).toEqual({});
    shelf.rerender({ suggested: ['a', 'b'], saved: [] });
    expect(marks(shelf.result.current)).toEqual({});
  });

  it('a change plays once: the marks go when the animation has run, and drawing the same shelf again moves nothing', () => {
    vi.useFakeTimers();
    const shelf = draw({ suggested: ['a', 'b', 'c'], saved: [] });
    // "a" is saved: it turns solid and "d" arrives at the end.
    shelf.rerender({ suggested: ['b', 'c', 'd'], saved: ['a'] });
    expect(marks(shelf.result.current)).toEqual({ d: 'arriving', a: 'solid' });
    // Back to the shelf from search results, or another view, while it plays: the same marks.
    shelf.rerender({ suggested: ['b', 'c', 'd'], saved: ['a'] });
    expect(marks(shelf.result.current)).toEqual({ d: 'arriving', a: 'solid' });
    // A refresh answering with the same books meanwhile does not cut it short.
    shelf.rerender({ suggested: ['b', 'c', 'd'], saved: ['a'], result: 2 });
    expect(marks(shelf.result.current)).toEqual({ d: 'arriving', a: 'solid' });
    act(() => { vi.advanceTimersByTime(SUGGESTION_MOTION_MS + 100); });
    expect(marks(shelf.result.current)).toEqual({});
    // After it has played: the same shelf drawn again, nothing replays.
    shelf.rerender({ suggested: ['b', 'c', 'd'], saved: ['a'], result: 2 });
    expect(marks(shelf.result.current)).toEqual({});
    // And the shelf drawn anew (back from a book page) neither.
    shelf.unmount();
    expect(marks(draw({ suggested: ['b', 'c', 'd'], saved: ['a'] }).result.current)).toEqual({});
  });

  it('a quiet result (the first answer replacing the seed list shown while it was late) does not move; later changes do', () => {
    const shelf = draw({ suggested: ['s1', 's2', 's3'], saved: [], result: 0 });
    shelf.rerender({ suggested: ['x', 's1', 's2'], saved: [], result: 1, quiet: true });
    expect(marks(shelf.result.current)).toEqual({});
    // Saving "x" before the next answer: it turns solid and "s3" arrives, as usual.
    shelf.rerender({ suggested: ['s1', 's2', 's3'], saved: ['x'], result: 1, quiet: true });
    expect(marks(shelf.result.current)).toEqual({ s3: 'arriving', x: 'solid' });
  });
});
