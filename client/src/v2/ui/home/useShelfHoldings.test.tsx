import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { createElement, Fragment, type ReactNode } from 'react';
import { HoldingsProvider, useHoldingsStore, type HoldingsStore } from '../../holdings';
import { useShelfHoldings } from './useShelfHoldings';
import type { RecentBook } from '../../types';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const book = (n: number) => ({ bookKey: `v1:openlibrary:OL${n}W`, title: `Book ${n}` }) as unknown as RecentBook;
function Shelf({ libraryId, books }: { libraryId: string | null; books: RecentBook[] }) {
  useShelfHoldings(libraryId, books);
  return null;
}
const tree = (library: string | null, shelf: ReactNode) => createElement(HoldingsProvider, { libraryId: library, children: shelf });
const reply = (answers: Record<string, string>) => new Response(JSON.stringify({ answers }), { status: 200, headers: { 'Content-Type': 'application/json' } });

it('asks for stored answers once per visit: on return only for books still without an answer, else only for a new book or another library', async () => {
  // Every book but book 2 has a stored answer.
  const lookup = vi.fn(async (_path: string, init?: RequestInit) => {
    const { books } = JSON.parse(String(init?.body)) as { books: Array<{ bookKey: string }> };
    return reply(Object.fromEntries(books.filter(item => item.bookKey !== book(2).bookKey).map(item => [item.bookKey, 'found'])));
  });
  vi.stubGlobal('fetch', lookup);
  const asked = () => lookup.mock.calls.map(([, init]) => JSON.parse(String(init?.body))).map(({ libraryId, books }: { libraryId: string; books: Array<{ bookKey: string }> }) => [libraryId, books.map(item => item.bookKey)]);
  const { rerender } = render(tree('lib:a', createElement(Shelf, { libraryId: 'lib:a', books: [book(1), book(2)] })));
  await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
  await new Promise(resolve => setTimeout(resolve, 0));
  // A book page replaces the shelf, then the shelf comes back: book 2 had no
  // answer, so it is asked about once more; book 1's answer is kept.
  rerender(tree('lib:a', null));
  rerender(tree('lib:a', createElement(Shelf, { libraryId: 'lib:a', books: [book(1), book(2)] })));
  await waitFor(() => expect(lookup).toHaveBeenCalledTimes(2));
  // Drawn again without leaving: nothing more, except for a newly saved book.
  rerender(tree('lib:a', createElement(Shelf, { libraryId: 'lib:a', books: [book(2), book(1)] })));
  rerender(tree('lib:a', createElement(Shelf, { libraryId: 'lib:a', books: [book(1)] })));
  rerender(tree('lib:a', createElement(Shelf, { libraryId: 'lib:a', books: [book(1), book(3)] })));
  rerender(tree('lib:b', createElement(Shelf, { libraryId: 'lib:b', books: [book(1), book(3)] })));
  await waitFor(() => expect(lookup).toHaveBeenCalledTimes(4));
  expect(asked()).toEqual([['lib:a', [book(1).bookKey, book(2).bookKey]], ['lib:a', [book(2).bookKey]], ['lib:a', [book(3).bookKey]], ['lib:b', [book(1).bookKey, book(3).bookKey]]]);
});

it('on return asks once more for a book whose check could not answer, so a late answer shows without a reload', async () => {
  const answers: Record<string, string> = {};
  const lookup = vi.fn(async () => reply(answers));
  vi.stubGlobal('fetch', lookup);
  let store: HoldingsStore | null = null;
  function Spy() { store = useHoldingsStore(); return null; }
  const shelf = () => createElement(Fragment, null, createElement(Spy), createElement(Shelf, { libraryId: 'lib:a', books: [book(1)] }));
  const { rerender } = render(tree('lib:a', shelf()));
  await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
  // The book page could not check in time; the check finishes in the background.
  rerender(tree('lib:a', createElement(Spy)));
  act(() => store!.set('lib:a', { [book(1).bookKey]: 'unknown' }));
  answers[book(1).bookKey] = 'found';
  rerender(tree('lib:a', shelf()));
  await waitFor(() => expect(store!.get(book(1).bookKey)).toBe('found'));
  expect(lookup).toHaveBeenCalledTimes(2);
  // Once found, coming back again asks nothing.
  rerender(tree('lib:a', createElement(Spy)));
  rerender(tree('lib:a', shelf()));
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(lookup).toHaveBeenCalledTimes(2);
});

it('asks again when the shelf closed before the answer came', async () => {
  const lookup = vi.fn((_path: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
  vi.stubGlobal('fetch', lookup);
  const { rerender } = render(tree('lib:a', createElement(Shelf, { libraryId: 'lib:a', books: [book(1)] })));
  await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
  rerender(tree('lib:a', null));
  await Promise.resolve();
  rerender(tree('lib:a', createElement(Shelf, { libraryId: 'lib:a', books: [book(1)] })));
  await waitFor(() => expect(lookup).toHaveBeenCalledTimes(2));
});
