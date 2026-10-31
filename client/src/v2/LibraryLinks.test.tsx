import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { publicApi, PublicApiError } from './api';
import { LibraryStateProvider, useLibrary } from './context';
import { ANONYMOUS_WEB_STORAGE_KEY } from './localState';
import { SelectLibraryPage } from './ui/library/SelectLibraryPage';
import { CopyLibraryLink } from './ui/library/CopyLibraryLink';
import type { PublicLibrary } from './types';

vi.mock('./api', async importOriginal => ({ ...await importOriginal<typeof import('./api')>(), publicApi: { resolveLibrary: vi.fn(), resolveLibraryLink: vi.fn() } }));
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); vi.unstubAllGlobals(); });
const library: PublicLibrary = { id: 'koha:anna-centenary-library', name: 'Anna Centenary Library', selectionPath: '/select/anna-centenary-library', health: 'operational', city: 'Chennai', region: 'Tamil Nadu', country: 'IN', capabilities: { catalogLookup: true, publicAvailability: true, copyCounts: true, locationAvailability: true, callNumber: true, catalogLink: true } };
function Selected() { const { library } = useLibrary(); return <h1>{library?.name}</h1>; }
function renderLink() {
  vi.mocked(publicApi.resolveLibrary).mockResolvedValue(library);
  return render(<MemoryRouter initialEntries={[library.selectionPath!]}><LibraryStateProvider><Routes>
    <Route path="/select/:slug" element={<SelectLibraryPage />} /><Route path="/app/search" element={<Selected />} />
  </Routes></LibraryStateProvider></MemoryRouter>);
}

it('retries an unavailable link and selects only after successful resolution', async () => {
  vi.mocked(publicApi.resolveLibraryLink).mockRejectedValueOnce(new PublicApiError({ status: 503 })).mockResolvedValueOnce(library);
  renderLink();
  expect(await screen.findByText('We couldn’t open this library link just now. Please try again.')).toBeInTheDocument();
  expect(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: library.name })).toBeInTheDocument();
  expect(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: `Choose ${library.name}` }));
  expect(JSON.parse(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)!).selectedLibraryId).toBe(library.id);
});

it('cancels a pending link when the reader leaves and ignores late results', async () => {
  let resolve!: (value: PublicLibrary) => void;
  vi.mocked(publicApi.resolveLibraryLink).mockReturnValue(new Promise(done => { resolve = done; }));
  const view = renderLink();
  const signal = vi.mocked(publicApi.resolveLibraryLink).mock.calls[0][1]!;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => { resolve(library); });
  expect(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)).toBeNull();
});

it('copies a shareable absolute URL and offers manual copying when clipboard access is blocked', async () => {
  const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  render(<CopyLibraryLink library={library} />);
  fireEvent.click(screen.getByRole('button', { name: `Copy link for ${library.name}` }));
  expect(await screen.findByText('Link copied')).toBeInTheDocument();
  const url = new URL(library.selectionPath!, window.location.origin).href;
  expect(writeText).toHaveBeenCalledWith(url);
  fireEvent.click(screen.getByRole('button', { name: `Copy link for ${library.name}` }));
  expect(await screen.findByRole('textbox', { name: 'Library link' })).toHaveValue(url);
});
