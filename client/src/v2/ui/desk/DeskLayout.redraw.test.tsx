import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { memo, type ComponentProps, type ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AnonymousWebApp } from '../../App';
import { ANONYMOUS_WEB_STORAGE_KEY } from '../../localState';
import { forgetSuggestionVisit } from '../../suggestions/useShelfSuggestions';
import { forgetSuggestionMotion } from '../shelf/useSuggestionMotion';
import { BookCover3D } from '../shelf/BookCover3D';

// Opening a book beside a long shelf draws again only the cover that is now
// outlined, not every cover (docs/STATUS.md, desktop layout follow-up: the
// long task when opening a book with 100 saved books). Each cover's drawing
// is counted by wrapping the real component, compared as the real one is.
const drawn = vi.hoisted(() => ({ keys: [] as string[] }));
vi.mock('../shelf/BookCover3D', async original => {
  const actual = await original<typeof import('../shelf/BookCover3D')>();
  const real = actual.BookCover3D as unknown as { type: (props: ComponentProps<typeof actual.BookCover3D>) => ReactElement; compare: null | ((a: object, b: object) => boolean) };
  const counted = (props: ComponentProps<typeof actual.BookCover3D>) => { drawn.keys.push(props.entry.key); return real.type(props); };
  return { BookCover3D: Object.assign(memo(counted, real.compare || undefined), { real: actual.BookCover3D }) };
});

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: (query: string) => {
    const min = /min-(width|height):\s*(\d+)px/.exec(query);
    return { matches: min ? (min[1] === 'width' ? 1440 : 900) >= Number(min[2]) : false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false };
  } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); forgetSuggestionVisit(); forgetSuggestionMotion(); });

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const book = (index: number) => ({ bookKey: 'v1:openlibrary:OL' + index + 'W', title: 'Book ' + index, authors: ['Author ' + index], source: 'direct', viewedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString() });

it('the cover is a memoised component', () => {
  const real = (BookCover3D as unknown as { real: { $$typeof: symbol } }).real;
  expect(real.$$typeof).toBe(Symbol.for('react.memo'));
});

it('opening a book beside 100 saved books draws again only its own cover', async () => {
  const saved = Array.from({ length: 100 }, (_, index) => book(index + 1));
  localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 2, selectedLibraryId: null, recentBooks: [], savedBooks: saved, savedContent: [] }));
  vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
    if (path.endsWith('/session')) return Promise.resolve(json({ status: 'guest' }));
    if (path.endsWith('/books/resolve')) return Promise.resolve(json({ book: { ...book(1), bookKey: JSON.parse(String(init?.body)).bookKey } }));
    return Promise.resolve(json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404));
  }));
  render(<MemoryRouter initialEntries={['/app/shelf']}><AnonymousWebApp /></MemoryRouter>);
  const cover = await screen.findByRole('link', { name: /^Book 7 by Author 7/ });
  // Let the shelf settle (suggestions, Viewed before) before counting.
  await waitFor(() => expect(document.querySelectorAll('.desk-shelf [data-shelf-key]').length).toBeGreaterThan(100));
  await new Promise(resolve => setTimeout(resolve, 50));
  drawn.keys = [];
  fireEvent.click(cover);
  expect(await screen.findByRole('button', { name: 'Close the book' })).toBeInTheDocument();
  // Viewed before is written as the book opens; wait for it.
  await waitFor(() => expect(document.querySelector('.desk-shelf .viewed-before a')).not.toBeNull());
  await new Promise(resolve => setTimeout(resolve, 50));
  const savedKeys = new Set(saved.map(item => item.bookKey));
  expect(drawn.keys.filter(key => savedKeys.has(key))).toEqual([book(7).bookKey]);
});
