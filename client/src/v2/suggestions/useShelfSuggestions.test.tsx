import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { RecentBook } from '../types';
import type { SuggestedBook } from './pickSuggestions';
import { SEED_SUGGESTIONS } from './seed';
import { forgetSuggestionVisit, suggestionRefreshKey, useShelfSuggestions, type SuggestionSource } from './useShelfSuggestions';

const saved = (bookKey: string): RecentBook => ({ bookKey, title: 'Saved', authors: ['Someone'], source: 'direct', viewedAt: '2026-11-01T00:00:00.000Z' });
const book = (id: number, author = 'Author ' + id): SuggestedBook => ({ bookKey: 'v1:openlibrary:OL' + id + 'W', title: 'Book ' + id, authors: [author] });
const keys = (books: readonly SuggestedBook[]) => books.map(item => item.bookKey);
const deferred = <T,>() => { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

afterEach(() => { forgetSuggestionVisit(); localStorage.clear(); sessionStorage.clear(); });

describe('useShelfSuggestions', () => {
  it('with only the bundled list: the first five not saved, at once', () => {
    const { result, rerender } = renderHook(({ shelf }) => useShelfSuggestions(shelf, null), { initialProps: { shelf: [] as RecentBook[] } });
    expect(result.current).toEqual(SEED_SUGGESTIONS.slice(0, 5));
    rerender({ shelf: [saved(SEED_SUGGESTIONS[1].bookKey)] });
    expect(keys(result.current)).toEqual(keys([SEED_SUGGESTIONS[0], ...SEED_SUGGESTIONS.slice(2, 6)]));
  });

  it('a source plugs in ahead of the seed list and is asked again only when a book is saved or removed, or the library changes', async () => {
    const load = vi.fn(async ({ libraryId }: { libraryId: string | null }) => libraryId === 'lib:b' ? [book(20)] : [book(10), book(11)]);
    const sources: SuggestionSource[] = [{ id: 'server', load }];
    const shelf = [saved('v1:openlibrary:OL1W')];
    const { result, rerender } = renderHook(({ shelf, library }) => useShelfSuggestions(shelf, library, sources), { initialProps: { shelf, library: 'lib:a' as string | null } });
    // The seed list stands until the source answers; then the source's books come first.
    expect(result.current).toEqual(SEED_SUGGESTIONS.slice(0, 5));
    await waitFor(() => expect(keys(result.current).slice(0, 2)).toEqual(keys([book(10), book(11)])));
    expect(keys(result.current).slice(2)).toEqual(keys(SEED_SUGGESTIONS.slice(0, 3)));
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][0]).toEqual({ savedBooks: shelf, libraryId: 'lib:a' });
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

  it('keeps nothing in browser storage', async () => {
    renderHook(() => useShelfSuggestions([saved('v1:openlibrary:OL1W')], 'lib:a', [{ id: 'server', load: async () => [book(10)] }]));
    await act(async () => { await Promise.resolve(); });
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it('refreshes on the set of saved books and the library, not their order', () => {
    const a = saved('v1:openlibrary:OL1W'), b = saved('v1:openlibrary:OL2W');
    expect(suggestionRefreshKey([a, b], 'lib')).toBe(suggestionRefreshKey([b, a], 'lib'));
    expect(suggestionRefreshKey([a], 'lib')).not.toBe(suggestionRefreshKey([a, b], 'lib'));
    expect(suggestionRefreshKey([a], 'lib')).not.toBe(suggestionRefreshKey([a], null));
  });
});
