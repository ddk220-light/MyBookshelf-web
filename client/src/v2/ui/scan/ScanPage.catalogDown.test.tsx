import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ScanPage } from './ScanPage';
import { publicApi, PublicApiError } from '../../api';

const library = { id: 'koha:example', name: 'Example Library', catalogUrl: 'https://catalog.example.org/',
  capabilities: { titleSearch: true, isbnLookup: true } };
vi.mock('../../context', async original => ({ ...(await original<typeof import('../../context')>()),
  useLibrary: () => ({ library, loadingLibrary: false, libraryError: false, retryLibrary: vi.fn(), state: { recentBooks: [], savedBooks: [] } }) }));
vi.mock('../../api', async original => ({ ...(await original<typeof import('../../api')>()), publicApi: { searchBooks: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function open(state?: unknown) {
  render(<MemoryRouter initialEntries={[{ pathname: '/app/search', state }]}><Routes><Route path="/app/search" element={<ScanPage />} /></Routes></MemoryRouter>);
}
function search(text: string) {
  fireEvent.change(screen.getByLabelText('Title, author or ISBN'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Search books' }));
}

it('says the catalog did not answer instead of saying the book was not found', async () => {
  vi.mocked(publicApi.searchBooks).mockRejectedValue(new PublicApiError({ code: 'CATALOG_UNAVAILABLE', status: 503 }));
  open();
  search('Wings of Fire');
  expect(await screen.findByRole('heading', { name: 'Example Library’s catalog isn’t answering' })).toBeInTheDocument();
  expect(screen.getByText(/Their server didn’t respond, so we couldn’t check/)).toBeInTheDocument();
  expect(screen.queryByText(/couldn’t find/i)).toBeNull();
  expect(screen.queryByText(/not found/i)).toBeNull();
  expect(screen.getByRole('link', { name: 'Their website' })).toHaveAttribute('href', 'https://catalog.example.org/');
  expect(publicApi.searchBooks).toHaveBeenLastCalledWith('Wings of Fire', expect.any(AbortSignal), 'koha:example');

  // Retrying asks the same catalog again.
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(publicApi.searchBooks).toHaveBeenCalledTimes(2));
  expect(publicApi.searchBooks).toHaveBeenLastCalledWith('Wings of Fire', expect.any(AbortSignal), 'koha:example');

  // The alternative keeps the query and searches public book data.
  vi.mocked(publicApi.searchBooks).mockResolvedValue({ kind: 'candidates', candidates: [{ bookKey: 'v1:openlibrary:OL1W', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'] }] });
  fireEvent.click(await screen.findByRole('button', { name: /Search all books instead/ }));
  expect(await screen.findByText('A. P. J. Abdul Kalam')).toBeInTheDocument();
  expect(publicApi.searchBooks).toHaveBeenLastCalledWith('Wings of Fire', expect.any(AbortSignal), undefined);
  expect(screen.queryByRole('heading', { name: /catalog isn’t answering/ })).toBeNull();
});

it('explains a timeout and a gateway failure the same honest way', async () => {
  vi.mocked(publicApi.searchBooks).mockRejectedValue(new PublicApiError({ code: 'CATALOG_TIMEOUT', status: 503 }));
  open();
  search('Malgudi Days');
  expect(await screen.findByText(/took too long to answer, so we couldn’t check/)).toBeInTheDocument();
  cleanup();
  vi.mocked(publicApi.searchBooks).mockRejectedValue(new PublicApiError({ status: 504 }));
  open();
  search('Malgudi Days');
  expect(await screen.findByRole('heading', { name: 'Example Library’s catalog isn’t answering' })).toBeInTheDocument();
});

it('keeps ordinary answers and connection problems as they were', async () => {
  vi.mocked(publicApi.searchBooks).mockRejectedValue(new PublicApiError({ code: 'BOOK_NOT_FOUND', status: 404 }));
  open();
  search('Unknown title');
  expect(await screen.findByText('Book not found. Try another title or ISBN.')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /catalog isn’t answering/ })).toBeNull();
  cleanup();
  vi.mocked(publicApi.searchBooks).mockRejectedValue(new PublicApiError({ code: 'NETWORK_ERROR' }));
  open();
  search('Unknown title');
  expect(await screen.findByText('Couldn’t connect. Check your connection and try again.')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /catalog isn’t answering/ })).toBeNull();
  cleanup();
  // A book-details outage is not the library's catalog failing.
  vi.mocked(publicApi.searchBooks).mockRejectedValue(new PublicApiError({ code: 'METADATA_UNAVAILABLE', status: 503 }));
  open();
  search('9788173711466');
  expect(await screen.findByText('We couldn’t complete this search. Please try again.')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /catalog isn’t answering/ })).toBeNull();
});

it('still searches the selected library after a reload has dropped the remembered results', async () => {
  vi.mocked(publicApi.searchBooks).mockResolvedValue({ kind: 'candidates', candidates: [] });
  // History state survives a reload; the in-memory results it points to do not.
  open({ candidateId: 'results-lost-on-reload' });
  expect(screen.getByRole('button', { name: 'Example Library' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'All books' })).toHaveAttribute('aria-pressed', 'false');
  search('Wings of Fire');
  await waitFor(() => expect(publicApi.searchBooks).toHaveBeenCalledWith('Wings of Fire', expect.any(AbortSignal), 'koha:example'));
});

it('explains a native-script search the catalog cannot run, without calling it an outage', async () => {
  vi.mocked(publicApi.searchBooks).mockRejectedValue(new PublicApiError({ code: 'CATALOG_QUERY_UNSUPPORTED', status: 400 }));
  open();
  search('వేయి పడగలు');
  expect(await screen.findByText(/searches only in English letters. Try a romanised spelling/)).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /catalog isn’t answering/ })).toBeNull();
  expect(screen.queryByText(/not found/i)).toBeNull();
});
