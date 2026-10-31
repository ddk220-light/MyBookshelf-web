import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LibraryStateProvider } from '../../context';
import { ANONYMOUS_WEB_STORAGE_KEY } from '../../localState';
import { publicApi } from '../../api';
import { BookPage } from '../book/BookPage';

vi.mock('../../api', () => ({ publicApi: { resolveBook: vi.fn(), enrichBook: vi.fn(), resolveLibrary: vi.fn(), availability: vi.fn() }, PublicApiError: class extends Error {} }));
beforeEach(() => { vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true }))); });
afterEach(() => { vi.unstubAllGlobals(); cleanup(); localStorage.clear(); vi.clearAllMocks(); });

it('checks other editions by default and lets a scanned ISBN stay exact', async () => {
  const book = { bookKey: 'v1:isbn:9788173711466', isbn13: '9788173711466', title: 'Wings of Fire', authors: ['Kalam'], workId: 'OL1037811W', language: 'eng', languages: ['eng', 'hin'] };
  localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 1, selectedLibraryId: 'koha:example', recentBooks: [], savedBooks: [] }));
  vi.mocked(publicApi.resolveBook).mockResolvedValue(book);
  vi.mocked(publicApi.resolveLibrary).mockResolvedValue({ id: 'koha:example', name: 'Example Library', city: null, region: null, country: 'IN', health: 'operational',
    capabilities: { publicAvailability: true, catalogLookup: true, copyCounts: false, locationAvailability: false, callNumber: false, catalogLink: true } });
  vi.mocked(publicApi.availability).mockResolvedValue({ outcome: 'in_catalog', matchKind: 'verified_work', lookupKind: 'verified_work', freshness: 'fresh', attemptedAt: '2026-10-26T12:00:00Z', matchedBook: { title: book.title, isbn13: '9788173715181' } });
  render(<MemoryRouter initialEntries={[`/app/books/${encodeURIComponent(book.bookKey)}?page=library`]}><LibraryStateProvider><Routes><Route path="/app/books/:bookKey" element={<BookPage />} /></Routes></LibraryStateProvider></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Listed in the catalog' })).toBeInTheDocument();
  expect(publicApi.availability).toHaveBeenLastCalledWith('koha:example', book.bookKey, { editionScope: 'work', language: 'eng' });
  expect(screen.getByText(/Matching edition/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Edition settings/ }));
  expect(publicApi.resolveBook).toHaveBeenCalledTimes(1);
  expect(publicApi.availability).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('Book language'), { target: { value: 'hin' } });
  await waitFor(() => expect(publicApi.availability).toHaveBeenLastCalledWith('koha:example', book.bookKey, { editionScope: 'work', language: 'hin' }));
  fireEvent.click(screen.getByLabelText(/Only this ISBN/));
  await waitFor(() => expect(publicApi.availability).toHaveBeenLastCalledWith('koha:example', book.bookKey, { editionScope: 'exact', language: 'hin' }));
  expect(screen.queryByLabelText('Book language')).toBeNull();
});

it('does not send a hidden English filter when a book has no known language', async () => {
  const book = { bookKey: 'v1:openlibrary:OL29062473W', title: 'A Modern Approach to Logical Reasoning', authors: ['R. S. Aggarwal'], languages: [] };
  localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 1, selectedLibraryId: 'chamo:iit-madras', recentBooks: [], savedBooks: [] }));
  vi.mocked(publicApi.resolveBook).mockResolvedValue(book);
  vi.mocked(publicApi.resolveLibrary).mockResolvedValue({ id: 'chamo:iit-madras', name: 'Indian Institute of Technology Madras', city: 'Chennai', region: 'Tamil Nadu', country: 'IN', health: 'operational',
    capabilities: { publicAvailability: true, catalogLookup: true, copyCounts: true, locationAvailability: true, callNumber: true, catalogLink: true } });
  vi.mocked(publicApi.availability).mockResolvedValue({ outcome: 'available', matchKind: 'verified_work', lookupKind: 'verified_work', freshness: 'fresh', availableCopies: 1, attemptedAt: '2026-10-27T12:00:00Z' });
  render(<MemoryRouter initialEntries={[`/app/books/${encodeURIComponent(book.bookKey)}?page=library`]}><LibraryStateProvider><Routes><Route path="/app/books/:bookKey" element={<BookPage />} /></Routes></LibraryStateProvider></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Available at the library' })).toBeInTheDocument();
  expect(publicApi.availability).toHaveBeenLastCalledWith('chamo:iit-madras', book.bookKey, { editionScope: 'work' });
  expect(screen.queryByLabelText('Book language')).toBeNull();
});

it('checks the selected ISBN while retaining a work identity when exact editions are selected', async () => {
  const book = { bookKey: 'v1:openlibrary:OL1037811W', isbn13: '9788173711466', title: 'Wings of Fire', authors: ['Kalam'] };
  localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 1, selectedLibraryId: 'koha:example', recentBooks: [], savedBooks: [] }));
  vi.mocked(publicApi.resolveBook).mockResolvedValue(book);
  vi.mocked(publicApi.resolveLibrary).mockResolvedValue({ id: 'koha:example', name: 'Example Library', city: null, region: null, country: 'IN', health: 'unknown',
    capabilities: { publicAvailability: true, catalogLookup: true, copyCounts: false, locationAvailability: false, callNumber: false, catalogLink: true } });
  vi.mocked(publicApi.availability).mockResolvedValue({ outcome: 'available', lookupKind: 'exact_isbn', matchKind: 'exact_isbn', freshness: 'fresh', attemptedAt: '2026-10-28T00:00:00Z' });
  render(<MemoryRouter initialEntries={['/app/books/' + encodeURIComponent(book.bookKey) + '?edition=exact']}><LibraryStateProvider><Routes><Route path="/app/books/:bookKey" element={<BookPage />} /></Routes></LibraryStateProvider></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Available at the library' })).toBeInTheDocument();
  expect(publicApi.availability).toHaveBeenCalledWith('koha:example', 'v1:isbn:' + book.isbn13, { editionScope: 'exact' });
  fireEvent.click(screen.getByRole('button', { name: 'Save book' }));
  expect(JSON.parse(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)!).savedBooks[0].bookKey).toBe(book.bookKey);
});

it('keeps catalog identity even when an incoming link has exact-edition preferences', async () => {
  const book = { bookKey: 'v1:catalog:koha:example:123', isbn13: '9788173711466', title: 'Wings of Fire', authors: ['Kalam'] };
  localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 1, selectedLibraryId: 'koha:example', recentBooks: [], savedBooks: [] }));
  vi.mocked(publicApi.resolveBook).mockResolvedValue(book);
  vi.mocked(publicApi.enrichBook).mockResolvedValue(book);
  vi.mocked(publicApi.resolveLibrary).mockResolvedValue({ id: 'koha:example', name: 'Example Library', city: null, region: null, country: 'IN', health: 'unknown',
    capabilities: { publicAvailability: true, catalogLookup: true, copyCounts: false, locationAvailability: false, callNumber: false, catalogLink: true } });
  vi.mocked(publicApi.availability).mockResolvedValue({ outcome: 'available', lookupKind: 'catalog_record', matchKind: 'catalog_record', freshness: 'fresh', attemptedAt: '2026-10-28T00:00:00Z' });
  render(<MemoryRouter initialEntries={['/app/books/' + encodeURIComponent(book.bookKey) + '?edition=exact&language=hin']}><LibraryStateProvider><Routes><Route path="/app/books/:bookKey" element={<BookPage />} /></Routes></LibraryStateProvider></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Available at the library' })).toBeInTheDocument();
  expect(publicApi.availability).toHaveBeenCalledWith('koha:example', book.bookKey, undefined);
  expect(screen.queryByRole('button', { name: /Edition settings/ })).toBeNull();
});
