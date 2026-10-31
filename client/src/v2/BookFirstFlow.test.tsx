import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ScanPage } from './ui/scan/ScanPage';
import { LibrariesPage, resetLibrarySearchSession } from './ui/library/LibrariesPage';
import { publicApi } from './api';

const { selectLibrary } = vi.hoisted(() => ({ selectLibrary: vi.fn() }));
vi.mock('./context', () => ({ useLibrary: () => ({ selectLibrary, state: { recentBooks: [], savedBooks: [] }, library: { id: 'koha:saved', name: 'Previously selected library', capabilities: {} } }),
  isbnSource: () => 'search', isValidIsbn13: () => true, messageFor: (_: unknown, fallback: string) => fallback }));
vi.mock('./api', () => ({ publicApi: { searchBooks: vi.fn(), discoverLibraries: vi.fn(), libraryAreas: vi.fn(), searchPlaces: vi.fn(), resolveBook: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
beforeEach(() => { resetLibrarySearchSession(); vi.mocked(publicApi.libraryAreas).mockResolvedValue({ countries: [], regions: [], districts: [] }); });
const book = { bookKey: 'v1:isbn:9788173711466', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'] };
const library = { id: 'koha:example', name: 'Example library', country: 'IN', region: 'Tamil Nadu', city: 'Chennai', health: 'operational' as const,
  capabilities: { publicAvailability: true, catalogLookup: true, copyCounts: false, locationAvailability: false, callNumber: false, catalogLink: true } };
function Destination() { const location = useLocation(); return <div data-testid="destination">{location.pathname + location.search}</div>; }

it('book search stays global even when a library is remembered', async () => {
  vi.mocked(publicApi.searchBooks).mockResolvedValue({ kind: 'exact', book });
  render(<MemoryRouter initialEntries={['/app/search']}><Routes><Route path="/app/search" element={<ScanPage />} /><Route path="/app/books/:key" element={<Destination />} /></Routes></MemoryRouter>);
  expect(screen.getByText('Previously selected library')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Title, author or ISBN'), { target: { value: 'Wings of Fire' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search books' }));
  expect(await screen.findByTestId('destination')).toHaveTextContent('/app/books/v1%3Aisbn%3A9788173711466');
  expect(publicApi.searchBooks).toHaveBeenCalledWith('Wings of Fire', expect.any(AbortSignal), undefined);
});
it('shows a short list of grouped works with an explicit way to see more', async () => {
  const candidates = Array.from({ length: 8 }, (_, index) => ({ ...book, title: `Grouped book ${index}`, bookKey: `v1:openlibrary:OL${index + 1}W`, editionCount: 9 }));
  vi.mocked(publicApi.searchBooks).mockResolvedValue({ kind: 'candidates', candidates });
  render(<MemoryRouter initialEntries={['/app/search']}><Routes><Route path="/app/search" element={<ScanPage />} /></Routes></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Title, author or ISBN'), { target: { value: 'Grouped books' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search books' }));
  expect(await screen.findByText('Grouped book 0')).toBeInTheDocument();
  expect(screen.getAllByText('9 editions')).toHaveLength(5);
  expect(screen.queryByText('Grouped book 7')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Show more books' }));
  expect(screen.getByText('Grouped book 7')).toBeInTheDocument();
});
it('lets readers open each version of a title without changing its record key', async () => {
  const candidates = [
    { bookKey: 'v1:openlibrary:OL20774896W', title: 'A Modern Approach To Logical Reasoning', authors: ['Dr. R S Aggarwal'], publishedDate: '2014' },
    { bookKey: 'v1:openlibrary:OL29062473W', title: 'A Modern Approach to Logical Reasoning', authors: ['R. S. Aggarwal'], publishedDate: '2007' },
    { bookKey: 'v1:openlibrary:OL24612560W', title: 'A Modern Approach to Logical Reasoning', authors: [], publishedDate: '2017' },
  ];
  vi.mocked(publicApi.searchBooks).mockResolvedValue({ kind: 'candidates', candidates });
  render(<MemoryRouter initialEntries={['/app/search']}><Routes><Route path="/app/search" element={<ScanPage />} /><Route path="/app/books/:key" element={<Destination />} /></Routes></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Title, author or ISBN'), { target: { value: 'Modern approach to logical reasoning' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search books' }));
  expect(await screen.findByText('View 3 versions')).toBeInTheDocument();
  expect(screen.getAllByText(/A Modern Approach/i)).toHaveLength(1);
  fireEvent.click(screen.getByText('View 3 versions'));
  fireEvent.click(screen.getByRole('link', { name: /Published 2007/ }));
  expect(await screen.findByTestId('destination')).toHaveTextContent('/app/books/v1%3Aopenlibrary%3AOL29062473W');
});

it('labels spelling suggestions and preserves the book identity when opened', async () => {
  const candidate = { bookKey: 'v1:openlibrary:OL66554W', title: 'Pride and Prejudice', authors: ['Jane Austen'], searchMatch: 'spelling' as const };
  vi.mocked(publicApi.searchBooks).mockResolvedValue({ kind: 'candidates', candidates: [candidate] });
  render(<MemoryRouter initialEntries={['/app/search']}><Routes><Route path="/app/search" element={<ScanPage />} /><Route path="/app/books/:key" element={<Destination />} /></Routes></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Title, author or ISBN'), { target: { value: 'prdie prejudice austen' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search books' }));
  expect(await screen.findByRole('heading', { name: 'Similar matches' })).toBeInTheDocument();
  expect(screen.getByText('These titles or authors are close to your spelling. Check the details before choosing.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: /Pride and Prejudice/ }));
  expect(await screen.findByTestId('destination')).toHaveTextContent('/app/books/v1%3Aopenlibrary%3AOL66554W');
});
it('city selection starts a geographic search and choosing a library returns to the same book', async () => {
  vi.mocked(publicApi.resolveBook).mockResolvedValue(book);
  vi.mocked(publicApi.searchPlaces).mockResolvedValue([{ id: 'chennai', label: 'Chennai, Tamil Nadu, India', lat: 13.08, lon: 80.27 }]);
  vi.mocked(publicApi.discoverLibraries).mockResolvedValue({ libraries: [library], total: 1, nextOffset: null, nearby: true });
  const returnPath = `/app/books/${encodeURIComponent(book.bookKey)}?language=hin`;
  render(<MemoryRouter initialEntries={[{ pathname: '/app/libraries', search: `?book=${encodeURIComponent(book.bookKey)}`, state: { after: returnPath } }]}><Routes><Route path="/app/libraries" element={<LibrariesPage />} /><Route path="/app/books/:key" element={<Destination />} /></Routes></MemoryRouter>);
  expect(await screen.findByText('Wings of Fire')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '← Back to book' })).toHaveAttribute('href', returnPath);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Chennai' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  fireEvent.click(await screen.findByRole('button', { name: /Chennai, Tamil Nadu, India/ }));
  expect(await screen.findByText('Example library')).toBeInTheDocument();
  expect(publicApi.discoverLibraries).toHaveBeenCalledWith({ lat: 13.08, lon: 80.27, radiusKm: 25 }, expect.any(AbortSignal));
  fireEvent.click(screen.getByRole('button', { name: 'Select Example library' }));
  expect(selectLibrary).toHaveBeenCalledWith(library);
  expect(await screen.findByTestId('destination')).toHaveTextContent(returnPath);
});
