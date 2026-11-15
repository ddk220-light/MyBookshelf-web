import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { HoldingsProvider } from '../../holdings';
import { useShelfHoldings } from './useShelfHoldings';
import type { RecentBook } from '../../types';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const book = (n: number) => ({ bookKey: `v1:openlibrary:OL${n}W`, title: `Book ${n}` }) as unknown as RecentBook;
function Shelf({ libraryId, books }: { libraryId: string | null; books: RecentBook[] }) {
  useShelfHoldings(libraryId, books);
  return null;
}
const tree = (library: string | null, shelf: ReactNode) => createElement(HoldingsProvider, { libraryId: library, children: shelf });

it('asks for stored answers once per visit: not again when the shelf is drawn again, only for a new book or another library', async () => {
  const lookup = vi.fn(async (_path: string, _init?: RequestInit) => new Response(JSON.stringify({ answers: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', lookup);
  const asked = () => lookup.mock.calls.map(([, init]) => JSON.parse(String(init?.body))).map(({ libraryId, books }: { libraryId: string; books: Array<{ bookKey: string }> }) => [libraryId, books.map(item => item.bookKey)]);
  const { rerender } = render(tree('lib:a', createElement(Shelf, { libraryId: 'lib:a', books: [book(1), book(2)] })));
  await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
  // A book page replaces the shelf, then the shelf comes back.
  rerender(tree('lib:a', null));
  rerender(tree('lib:a', createElement(Shelf, { libraryId: 'lib:a', books: [book(1), book(2)] })));
  rerender(tree('lib:a', createElement(Shelf, { libraryId: 'lib:a', books: [book(2), book(1)] })));
  rerender(tree('lib:a', createElement(Shelf, { libraryId: 'lib:a', books: [book(1)] })));
  rerender(tree('lib:a', createElement(Shelf, { libraryId: 'lib:a', books: [book(1), book(3)] })));
  rerender(tree('lib:b', createElement(Shelf, { libraryId: 'lib:b', books: [book(1), book(3)] })));
  await waitFor(() => expect(lookup).toHaveBeenCalledTimes(3));
  expect(asked()).toEqual([['lib:a', [book(1).bookKey, book(2).bookKey]], ['lib:a', [book(3).bookKey]], ['lib:b', [book(1).bookKey, book(3).bookKey]]]);
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
