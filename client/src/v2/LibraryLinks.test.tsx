import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { publicApi } from './api';
import { LibraryStateProvider } from './context';
import { ANONYMOUS_WEB_STORAGE_KEY } from './localState';
import { SelectLibraryLink } from './ui/library/SelectLibraryLink';
import type { PublicLibrary } from './types';

vi.mock('./api', async importOriginal => ({ ...await importOriginal<typeof import('./api')>(), publicApi: { resolveLibrary: vi.fn(), resolveLibraryLink: vi.fn() } }));
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); vi.unstubAllGlobals(); });
const library: PublicLibrary = { id: 'koha:anna-centenary-library', name: 'Anna Centenary Library', selectionPath: '/select/anna-centenary-library', health: 'operational', city: 'Chennai', region: 'Tamil Nadu', country: 'IN', capabilities: { catalogLookup: true, publicAvailability: true, copyCounts: true, locationAvailability: true, callNumber: true, catalogLink: true } };

// Ported from the retired confirmation page: a guide page's library link that
// is still resolving when the reader leaves chooses nothing, even if the
// answer arrives later.
it('cancels a pending link when the reader leaves and ignores late results', async () => {
  let resolve!: (value: PublicLibrary) => void;
  vi.mocked(publicApi.resolveLibraryLink).mockReturnValue(new Promise(done => { resolve = done; }));
  const view = render(<MemoryRouter initialEntries={[library.selectionPath!]}><LibraryStateProvider><Routes>
    <Route path="/select/:slug" element={<SelectLibraryLink />} />
  </Routes></LibraryStateProvider></MemoryRouter>);
  const signal = vi.mocked(publicApi.resolveLibraryLink).mock.calls[0][1]!;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => { resolve(library); });
  expect(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)).toBeNull();
});
