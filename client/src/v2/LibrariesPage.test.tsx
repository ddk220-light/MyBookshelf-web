import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LibrariesPage } from './App';
import { resetLibrarySearchSession } from './ui/library/LibrariesPage';
import { publicApi } from './api';
import type { PublicLibrary } from './types';

const { selectLibrary } = vi.hoisted(() => ({ selectLibrary: vi.fn() }));
vi.mock('./context', () => ({ useLibrary: () => ({ selectLibrary, library: null }), messageFor: (_failure: unknown, fallback: string) => fallback, LibraryStateProvider: ({ children }: { children: unknown }) => children }));
vi.mock('./api', () => ({ publicApi: { discoverLibraries: vi.fn(), libraryAreas: vi.fn(), searchPlaces: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
beforeEach(() => { resetLibrarySearchSession(); vi.mocked(publicApi.searchPlaces).mockResolvedValue([]); vi.mocked(publicApi.libraryAreas).mockResolvedValue({ countries: ['IN'], regions: ['Tamil Nadu', 'Assam'], districts: ['Chennai'] }); });
const rows: PublicLibrary[] = Array.from({ length: 29 }, (_, i) => ({ id: `koha:tn-${i}`, name: `Library ${i + 1}`, country: 'IN', region: 'Tamil Nadu', city: 'Town', address: `Campus ${i + 1}, Tamil Nadu`, addressScope: 'campus', catalogUrl: 'https://catalog.example.test/', capabilities: { catalogLink: true, catalogLookup: true, publicAvailability: true, copyCounts: false, locationAvailability: false, callNumber: false }, health: 'unknown' }));

it('browses any area and paginates without losing the selected filters', async () => {
  vi.mocked(publicApi.discoverLibraries).mockResolvedValueOnce({ libraries: rows.slice(0, 25), total: 29, nextOffset: 25 }).mockResolvedValueOnce({ libraries: rows.slice(25), total: 29, nextOffset: null });
  render(<MemoryRouter initialEntries={['/app/libraries?country=IN&region=Tamil%20Nadu']}><LibrariesPage /></MemoryRouter>);
  expect(await screen.findByText('25 of 29 libraries')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Library 1 Town/ }));
  expect(screen.getByText('Campus 1, Tamil Nadu')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show more libraries' }));
  expect(await screen.findByText('29 of 29 libraries')).toBeInTheDocument();
  expect(within(screen.getByRole('list', { name: 'Library search results' })).getAllByRole('button', { name: /^Select / })).toHaveLength(29);
  expect(publicApi.discoverLibraries).toHaveBeenLastCalledWith(expect.objectContaining({ country: 'IN', region: 'Tamil Nadu', offset: 25 }), expect.any(AbortSignal));
  fireEvent.click(screen.getByRole('button', { name: 'Select Library 29' }));
  expect(selectLibrary).toHaveBeenCalledWith(rows[28]);
});

it('searches by name without imposing an India or state filter', async () => {
  vi.mocked(publicApi.discoverLibraries).mockResolvedValue({ libraries: [rows[0]], total: 1, nextOffset: null });
  render(<MemoryRouter><LibrariesPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Library, city or postcode'), { target: { value: 'Library 1' } });
  expect(await screen.findByText('1 of 1 libraries')).toBeInTheDocument();
  expect(publicApi.discoverLibraries).toHaveBeenLastCalledWith({ query: 'Library 1' }, expect.any(AbortSignal));
});

it('location denial leaves name and area search usable', async () => {
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (_ok: unknown, fail: () => void) => fail() } });
  render(<MemoryRouter><LibrariesPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Libraries near me' }));
  expect(await screen.findByText('Location unavailable. Enter a city, town or postcode, or browse by area.')).toBeInTheDocument();
  expect(publicApi.discoverLibraries).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Browse by country' })).toBeEnabled();
});

it('a failed request does not claim there are no matching libraries', async () => {
  vi.mocked(publicApi.discoverLibraries).mockRejectedValueOnce(new Error('offline'));
  render(<MemoryRouter><LibrariesPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Library, city or postcode'), { target: { value: 'Pune' } });
  expect(await screen.findByText('Couldn’t load libraries. Try again.')).toBeInTheDocument();
  expect(screen.queryByText(/No libraries found/)).not.toBeInTheDocument();
});

it('retries a failed appended page without dropping the first page', async () => {
  vi.mocked(publicApi.discoverLibraries).mockResolvedValueOnce({ libraries: rows.slice(0, 25), total: 29, nextOffset: 25 })
    .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ libraries: rows.slice(25), total: 29, nextOffset: null });
  render(<MemoryRouter initialEntries={['/app/libraries?country=IN&region=Tamil%20Nadu']}><LibrariesPage /></MemoryRouter>);
  await screen.findByText('25 of 29 libraries');
  fireEvent.click(screen.getByRole('button', { name: 'Show more libraries' }));
  await screen.findByText('Couldn’t load libraries. Try again.');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('29 of 29 libraries')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Select Library 1' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Select Library 29' })).toBeInTheDocument();
});
it('passes the selected country into place search', async () => {
  vi.mocked(publicApi.discoverLibraries).mockResolvedValue({ libraries: [], total: 0, nextOffset: null });
  render(<MemoryRouter initialEntries={['/app/libraries?country=US&region=Oregon']}><LibrariesPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Library, city or postcode'), { target: { value: 'Salem' } });
  await screen.findByText('No libraries found here');
  await waitFor(() => expect(publicApi.searchPlaces).toHaveBeenCalledWith('Salem', expect.any(AbortSignal), 'US'));
});
