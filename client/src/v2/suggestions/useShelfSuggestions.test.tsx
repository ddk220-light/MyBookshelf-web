import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { RecentBook } from '../types';
import type { SuggestedBook } from './pickSuggestions';
import { SEED_SUGGESTIONS } from './seed';
import { forgetSuggestionVisit, noteSuggestionInteraction, SUGGESTION_HOLD_MS, SUGGESTION_SOURCES, suggestionRefreshKey, useReportShown, useShelfSuggestions as useSuggestions,
  type SuggestionSource } from './useShelfSuggestions';

// The books only (most tests); `useSuggestions` gives the whole answer.
const useShelfSuggestions = (...args: Parameters<typeof useSuggestions>) => useSuggestions(...args).books;

const saved = (bookKey: string): RecentBook => ({ bookKey, title: 'Saved', authors: ['Someone'], source: 'direct', viewedAt: '2026-11-01T00:00:00.000Z' });
const book = (id: number, author = 'Author ' + id): SuggestedBook => ({ bookKey: 'v1:openlibrary:OL' + id + 'W', title: 'Book ' + id, authors: [author] });
const keys = (books: readonly SuggestedBook[]) => books.map(item => item.bookKey);
const deferred = <T,>() => { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

// Hooks share the visit: each test unmounts its own (no automatic cleanup without vitest globals).
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); forgetSuggestionVisit(); localStorage.clear(); sessionStorage.clear(); });

describe('useShelfSuggestions', () => {
  it('with only the bundled list: the first five not saved, at once', () => {
    const { result, rerender } = renderHook(({ shelf }) => useShelfSuggestions(shelf, null, []), { initialProps: { shelf: [] as RecentBook[] } });
    expect(result.current).toEqual(SEED_SUGGESTIONS.slice(0, 5));
    rerender({ shelf: [saved(SEED_SUGGESTIONS[1].bookKey)] });
    expect(keys(result.current)).toEqual(keys([SEED_SUGGESTIONS[0], ...SEED_SUGGESTIONS.slice(2, 6)]));
  });

  it('a source plugs in ahead of the seed list and is asked again only when a book is saved or removed, or the library changes', async () => {
    const load = vi.fn(async ({ libraryId }: { libraryId: string | null }) => libraryId === 'lib:b' ? [book(20)] : [book(10), book(11)]);
    const sources: SuggestionSource[] = [{ id: 'server', load }];
    const shelf = [saved('v1:openlibrary:OL1W')];
    const { result, rerender } = renderHook(({ shelf, library }) => useShelfSuggestions(shelf, library, sources), { initialProps: { shelf, library: 'lib:a' as string | null } });
    // The slots are held (nothing drawn) until the source answers; then the source's books come first.
    expect(result.current).toEqual([]);
    await waitFor(() => expect(keys(result.current).slice(0, 2)).toEqual(keys([book(10), book(11)])));
    expect(keys(result.current).slice(2)).toEqual(keys(SEED_SUGGESTIONS.slice(0, 3)));
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][0]).toEqual({ savedBooks: shelf, recentBooks: [], libraryId: 'lib:a' });
    // Browsing (a new render, the same saved books in another array): no refresh.
    rerender({ shelf: [...shelf], library: 'lib:a' });
    expect(load).toHaveBeenCalledTimes(1);
    // Saving the first suggestion: it leaves at once; the source is asked again.
    rerender({ shelf: [saved(book(10).bookKey), ...shelf], library: 'lib:a' });
    expect(keys(result.current)[0]).toBe(book(11).bookKey);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    // The library changes: asked again.
    rerender({ shelf: [saved(book(10).bookKey), ...shelf], library: 'lib:b' });
    await waitFor(() => expect(keys(result.current)[0]).toBe(book(20).bookKey));
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('within one visit the shelf drawn again keeps the answers; a new visit asks again', async () => {
    const load = vi.fn(async () => [book(10)]);
    const sources: SuggestionSource[] = [{ id: 'server', load }];
    const first = renderHook(() => useShelfSuggestions([], null, sources));
    await waitFor(() => expect(keys(first.result.current)[0]).toBe(book(10).bookKey));
    first.unmount();
    // Back from a book page: the same suggestions straight away, nothing asked.
    const again = renderHook(() => useShelfSuggestions([], null, sources));
    expect(keys(again.result.current)[0]).toBe(book(10).bookKey);
    expect(load).toHaveBeenCalledTimes(1);
    again.unmount();
    forgetSuggestionVisit();
    renderHook(() => useShelfSuggestions([], null, sources));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });

  it('a source that fails keeps its last books; one that never answered leaves the seed list', async () => {
    let answer = deferred<SuggestedBook[]>();
    const sources: SuggestionSource[] = [{ id: 'server', load: () => answer.promise }];
    const { result, rerender } = renderHook(({ shelf }) => useShelfSuggestions(shelf, null, sources), { initialProps: { shelf: [] as RecentBook[] } });
    await act(async () => { answer.reject(new TypeError('offline')); await answer.promise.catch(() => undefined); });
    expect(result.current).toEqual(SEED_SUGGESTIONS.slice(0, 5));
    answer = deferred();
    rerender({ shelf: [saved('v1:openlibrary:OL1W')] });
    await act(async () => { answer.resolve([book(10), book(11)]); await answer.promise; });
    expect(keys(result.current).slice(0, 2)).toEqual(keys([book(10), book(11)]));
    answer = deferred();
    rerender({ shelf: [] });
    await act(async () => { answer.reject(new Error('503')); await answer.promise.catch(() => undefined); });
    expect(keys(result.current).slice(0, 2)).toEqual(keys([book(10), book(11)]));
  });

  it('viewing a book is not a refresh; a newer refresh aborts the one still running and its late answer is ignored', async () => {
    const answers: Array<ReturnType<typeof deferred<SuggestedBook[]>>> = [];
    const signals: AbortSignal[] = [];
    const contexts: unknown[] = [];
    const sources: SuggestionSource[] = [{ id: 'server', load: (context, signal) => { contexts.push(context); signals.push(signal); const answer = deferred<SuggestedBook[]>(); answers.push(answer); return answer.promise; } }];
    const viewed = (bookKey: string) => ({ ...saved(bookKey), viewedAt: '2026-11-02T00:00:00.000Z' });
    const { result, rerender } = renderHook(({ shelf, recent }) => useShelfSuggestions(shelf, 'lib:a', sources, recent),
      { initialProps: { shelf: [] as RecentBook[], recent: [] as RecentBook[] } });
    expect(answers).toHaveLength(1);
    // Viewing books changes Viewed before only: nothing is asked again.
    rerender({ shelf: [], recent: [viewed('v1:openlibrary:OL5W')] });
    rerender({ shelf: [], recent: [viewed('v1:openlibrary:OL6W'), viewed('v1:openlibrary:OL5W')] });
    expect(answers).toHaveLength(1);
    // Saving a book while the first request runs: that one is aborted, a new one starts with the latest recent books.
    const shelf = [saved('v1:openlibrary:OL1W')];
    rerender({ shelf, recent: [viewed('v1:openlibrary:OL6W')] });
    await waitFor(() => expect(answers).toHaveLength(2));
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    expect(contexts[1]).toEqual({ savedBooks: shelf, recentBooks: [viewed('v1:openlibrary:OL6W')], libraryId: 'lib:a' });
    await act(async () => { answers[0].resolve([book(90)]); await answers[0].promise; });
    expect(keys(result.current)).not.toContain(book(90).bookKey);
    await act(async () => { answers[1].resolve([book(91)]); await answers[1].promise; });
    expect(keys(result.current)[0]).toBe(book(91).bookKey);
  });

  it('nothing to add (no library, no recent books): the seed list at once and nothing asked', () => {
    const load = vi.fn(async () => [book(10)]);
    const sources: SuggestionSource[] = [{ id: 'server', wanted: context => Boolean(context.libraryId), load }];
    const { result } = renderHook(() => useSuggestions([], null, sources));
    expect(result.current).toMatchObject({ books: SEED_SUGGESTIONS.slice(0, 5), held: false, quiet: false, result: 1 });
    expect(load).not.toHaveBeenCalled();
  });

  it('the first answer of a visit: the slots are held until it comes, then the books appear once, without motion', async () => {
    const answer = deferred<SuggestedBook[]>();
    const sources: SuggestionSource[] = [{ id: 'server', load: () => answer.promise }];
    const { result } = renderHook(() => useSuggestions([], 'lib:a', sources));
    expect(result.current).toEqual({ books: [], held: true, quiet: false, result: 0 });
    await act(async () => { answer.resolve([book(10)]); await answer.promise; });
    expect(result.current).toMatchObject({ held: false, quiet: false, result: 1 });
    expect(keys(result.current.books)).toEqual([book(10).bookKey, ...keys(SEED_SUGGESTIONS.slice(0, 4))]);
    // A first answer that fails ends the hold too: the seed list.
    forgetSuggestionVisit();
    const failing = deferred<SuggestedBook[]>();
    const second = renderHook(() => useSuggestions([], 'lib:a', [{ id: 'server', load: () => failing.promise }]));
    expect(second.result.current.held).toBe(true);
    await act(async () => { failing.reject(new TypeError('offline')); await failing.promise.catch(() => undefined); });
    expect(second.result.current).toMatchObject({ books: SEED_SUGGESTIONS.slice(0, 5), held: false, result: 1 });
  });

  it(`a first answer later than ${SUGGESTION_HOLD_MS} ms: the seed list stands in, and the answer replaces it quietly if no suggestion was touched`, async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const answers: Array<ReturnType<typeof deferred<SuggestedBook[]>>> = [];
    const sources: SuggestionSource[] = [{ id: 'server', load: () => { const answer = deferred<SuggestedBook[]>(); answers.push(answer); return answer.promise; } }];
    const { result, rerender } = renderHook(({ shelf }) => useSuggestions(shelf, 'lib:a', sources), { initialProps: { shelf: [] as RecentBook[] } });
    act(() => { vi.advanceTimersByTime(SUGGESTION_HOLD_MS - 1); });
    expect(result.current.held).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toMatchObject({ books: SEED_SUGGESTIONS.slice(0, 5), held: false, quiet: false, result: 0 });
    await act(async () => { answers[0].resolve([book(10)]); await answers[0].promise; });
    // Taken, without motion for this change.
    expect(result.current).toMatchObject({ held: false, quiet: true, result: 1 });
    expect(keys(result.current.books)[0]).toBe(book(10).bookKey);
    // A later refresh (a book saved) is taken as usual.
    rerender({ shelf: [saved('v1:openlibrary:OL1W')] });
    expect(result.current.quiet).toBe(true);
    await act(async () => { answers[1].resolve([book(20)]); await answers[1].promise; });
    expect(result.current).toMatchObject({ quiet: false, result: 2 });
    expect(keys(result.current.books)[0]).toBe(book(20).bookKey);
  });

  it('a late first answer is dropped once the reader has focused or pressed a suggestion: the seed list stays', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const answer = deferred<SuggestedBook[]>();
    const load = vi.fn(() => answer.promise);
    const sources: SuggestionSource[] = [{ id: 'server', load }];
    const first = renderHook(() => useSuggestions([], 'lib:a', sources));
    act(() => { vi.advanceTimersByTime(SUGGESTION_HOLD_MS); });
    expect(first.result.current.books).toEqual(SEED_SUGGESTIONS.slice(0, 5));
    noteSuggestionInteraction();
    await act(async () => { answer.resolve([book(10)]); await answer.promise; });
    expect(first.result.current).toMatchObject({ books: SEED_SUGGESTIONS.slice(0, 5), quiet: false, result: 1 });
    // Drawn again in this visit (back from a book page): the same books, nothing asked.
    first.unmount();
    const again = renderHook(() => useSuggestions([], 'lib:a', sources));
    expect(again.result.current.books).toEqual(SEED_SUGGESTIONS.slice(0, 5));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('the hold lasts at most its time in all, even when the shelf is drawn again meanwhile', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const load = vi.fn(() => new Promise<SuggestedBook[]>(() => {}));
    const sources: SuggestionSource[] = [{ id: 'server', load }];
    const first = renderHook(() => useSuggestions([], 'lib:a', sources));
    act(() => { vi.advanceTimersByTime(1000); });
    first.unmount();
    const again = renderHook(() => useSuggestions([], 'lib:a', sources));
    expect(again.result.current.held).toBe(true);
    act(() => { vi.advanceTimersByTime(SUGGESTION_HOLD_MS - 1000); });
    expect(again.result.current).toMatchObject({ books: SEED_SUGGESTIONS.slice(0, 5), held: false });
  });

  it('a source is given what it last gave, for a partial answer to build on', async () => {
    const load = vi.fn(async (_context: unknown, _signal: AbortSignal, previous: readonly SuggestedBook[]) => (previous.length ? [book(20)] : [book(10)]));
    const { rerender } = renderHook(({ shelf }) => useSuggestions(shelf, 'lib:a', [{ id: 'server', load }]) , { initialProps: { shelf: [] as RecentBook[] } });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    rerender({ shelf: [saved('v1:openlibrary:OL1W')] });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(load.mock.calls[0][2]).toEqual([]);
    expect(load.mock.calls[1][2]).toEqual([book(10)]);
  });

  it('"shown" is counted once per refresh result, for the books drawn, only while the shelf is shown; never for an aborted refresh', async () => {
    const events: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn((path: string, init: RequestInit) => { events.push([path, JSON.parse(String(init.body))]); return Promise.resolve(new Response('{}', { status: 202 })); }));
    const answers: Array<ReturnType<typeof deferred<SuggestedBook[]>>> = [];
    const sources: SuggestionSource[] = [{ id: 'server', load: () => { const answer = deferred<SuggestedBook[]>(); answers.push(answer); return answer.promise; } }];
    const { rerender } = renderHook(({ shelf, visible }) => { const suggestions = useSuggestions(shelf, 'lib:a', sources); useReportShown(suggestions, visible); return suggestions; },
      { initialProps: { shelf: [] as RecentBook[], visible: true } });
    // Held: nothing drawn, nothing counted.
    expect(events).toEqual([]);
    await act(async () => { answers[0].resolve([book(10)]); await answers[0].promise; });
    const shown = (bookKeys: string[]) => ['/api/v2/suggestions/events', { event: 'shown', bookKeys }];
    expect(events).toEqual([shown([book(10).bookKey, ...keys(SEED_SUGGESTIONS.slice(0, 4))])]);
    // Drawn again with nothing new: not counted again.
    rerender({ shelf: [], visible: true });
    expect(events).toHaveLength(1);
    // A refresh that a newer one aborts counts nothing; the newer one counts once.
    rerender({ shelf: [saved('v1:openlibrary:OL1W')], visible: true });
    rerender({ shelf: [saved('v1:openlibrary:OL1W'), saved('v1:openlibrary:OL2W')], visible: true });
    await act(async () => { answers[1].resolve([book(90)]); await answers[1].promise; });
    expect(events).toHaveLength(1);
    // Answered while search results hide the shelf: counted when the shelf shows again.
    rerender({ shelf: [saved('v1:openlibrary:OL1W'), saved('v1:openlibrary:OL2W')], visible: false });
    await act(async () => { answers[2].resolve([book(91)]); await answers[2].promise; });
    expect(events).toHaveLength(1);
    rerender({ shelf: [saved('v1:openlibrary:OL1W'), saved('v1:openlibrary:OL2W')], visible: true });
    expect(events).toEqual([events[0], shown([book(91).bookKey, ...keys(SEED_SUGGESTIONS.slice(0, 4))])]);
  });

  it('keeps nothing in browser storage', async () => {
    renderHook(() => useShelfSuggestions([saved('v1:openlibrary:OL1W')], 'lib:a', [{ id: 'server', load: async () => [book(10)] }]));
    await act(async () => { await Promise.resolve(); });
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it('the server source comes before the seed list by default', () => {
    expect(SUGGESTION_SOURCES.map(source => source.id)).toEqual(['server']);
  });

  it('refreshes on the set of saved books and the library, not their order', () => {
    const a = saved('v1:openlibrary:OL1W'), b = saved('v1:openlibrary:OL2W');
    expect(suggestionRefreshKey([a, b], 'lib')).toBe(suggestionRefreshKey([b, a], 'lib'));
    expect(suggestionRefreshKey([a], 'lib')).not.toBe(suggestionRefreshKey([a, b], 'lib'));
    expect(suggestionRefreshKey([a], 'lib')).not.toBe(suggestionRefreshKey([a], null));
  });
});
