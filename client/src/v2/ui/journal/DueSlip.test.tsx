import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { Availability, PublicLibrary } from '../../types';
import { CatalogDetails, DueSlip } from './DueSlip';

afterEach(() => { cleanup(); vi.useRealTimers(); });
const LIBRARY: PublicLibrary = {
  id: 'lib:x', name: 'Fixture Library', city: 'Testville', region: null, country: null,
  health: 'operational', catalogUrl: 'https://catalog.example.org',
  capabilities: { catalogLookup: true, publicAvailability: true, copyCounts: true, locationAvailability: false, callNumber: true, catalogLink: true },
};
const AVAILABLE: Availability = { outcome: 'available', lookupKind: 'exact_isbn', matchKind: 'exact_isbn', freshness: 'fresh', attemptedAt: '2026-10-07T00:00:00Z', observedAt: '2026-10-07T00:00:00Z', availableCopies: 1, totalCopies: 2, callNumber: '333.7 K96m' };
function show(availability: Availability | null = AVAILABLE, library: PublicLibrary | null = LIBRARY, props = {}) {
  return render(<MemoryRouter><CatalogDetails library={library} availability={availability} saved={false} /><DueSlip library={library} availability={availability} error={null} loadingLibrary={false} libraryError={null} onRetryLibrary={() => {}} {...props} /></MemoryRouter>);
}

it('gives a slow-check hint only while pending and resets it for a new lookup', () => {
  vi.useFakeTimers();
  const props = { library: LIBRARY, availability: null, error: null, loadingLibrary: false, libraryError: null, onRetryLibrary: () => {} };
  const view = render(<MemoryRouter><DueSlip {...props} lookupKey="first" /></MemoryRouter>);
  expect(screen.getByRole('status')).toHaveTextContent('Checking availability');
  act(() => vi.advanceTimersByTime(5000));
  expect(screen.getByRole('status')).toHaveTextContent('taking a little longer');
  view.rerender(<MemoryRouter><DueSlip {...props} lookupKey="second" /></MemoryRouter>);
  expect(screen.queryByText(/taking a little longer/)).toBeNull();
  act(() => vi.advanceTimersByTime(5000));
  view.rerender(<MemoryRouter><DueSlip {...props} lookupKey="second" availability={AVAILABLE} /></MemoryRouter>);
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getByRole('heading', { name: 'Available at the library' })).toBeInTheDocument();
});

it('shows a compact exact result with counts, location and one catalog action', () => {
  show();
  expect(screen.getByRole('heading', { name: 'Available at the library' })).toBeInTheDocument();
  expect(screen.getByText('1 available · 2 total')).toBeInTheDocument();
  expect(screen.getByText('333.7 K96m')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open library catalog' })).toHaveAttribute('href', LIBRARY.catalogUrl);
  expect(screen.queryByText(/Date due|public catalog reports|server/)).toBeNull();
});

it.each([
  ['none_available', 'No lending copies available'], ['not_found', 'Not listed in this catalog'], ['unknown', 'Availability unavailable'],
] as const)('distinguishes %s without claiming it is available', (outcome, title) => {
  show({ ...AVAILABLE, outcome });
  expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
  expect(screen.queryByText('Available at the library')).toBeNull();
  if (outcome !== 'none_available') expect(screen.queryByText('1 available · 2 total')).toBeNull();
});

it.each(['available', 'none_available', 'not_found'] as const)('replaces a retained %s result with a failed current check', (outcome) => {
  show({ ...AVAILABLE, outcome, freshness: 'stale' });
  expect(screen.getByRole('heading', { name: 'Availability unavailable' })).toBeInTheDocument();
  expect(screen.queryByText('Available at the library')).toBeNull();
  expect(screen.queryByText(/Checked|Previously|may have changed/)).toBeNull();
  expect(screen.queryByText('1 available · 2 total')).toBeNull();
});

it.each(['available', 'none_available', 'unknown'] as const)('never treats a possible %s edition as confirmed', (outcome) => {
  show({ ...AVAILABLE, outcome, matchKind: 'possible_match' });
  expect(screen.getByRole('heading', { name: 'Check the edition' })).toBeInTheDocument();
  expect(screen.queryByText('1 available · 2 total')).toBeNull();
});

it.each(['CATALOG_PROVIDER_BLOCKED', 'CATALOG_CONFIGURATION_REQUIRED', 'CATALOG_TIMEOUT'])('keeps %s internal while offering a catalog handoff', (errorCode) => {
  show({ ...AVAILABLE, outcome: 'unknown', freshness: 'none', errorCode });
  expect(screen.getByRole('heading', { name: errorCode === 'CATALOG_TIMEOUT' ? 'Catalog timed out' : 'Availability unavailable' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open library catalog' })).toBeInTheDocument();
  expect(screen.queryByText(/server|configuration|request/)).toBeNull();
});

it('gives the ISBN action when the edition is required', () => {
  show({ ...AVAILABLE, outcome: 'unknown', errorCode: 'CATALOG_EXACT_ISBN_REQUIRED' });
  expect(screen.getByRole('link', { name: 'Scan ISBN' })).toHaveAttribute('href', '/app/search');
  expect(screen.queryByRole('link', { name: 'Open library catalog' })).toBeNull();
});

it('keeps restrictions visible without a paragraph', () => {
  show(AVAILABLE, { ...LIBRARY, accessNote: 'Reference use only; books cannot be borrowed.' });
  expect(screen.getByText('For reading at the library. These copies cannot be borrowed.')).toBeInTheDocument();
});

it('shows verified non-lending holdings and their location without calling them borrowable', () => {
  show({ ...AVAILABLE, outcome: 'unknown', loanRestriction: 'not_for_loan', availableCopies: undefined,
    locations: [{ name: 'Sixth floor', totalCopies: 2, status: 'unknown' }] });
  expect(screen.getByRole('heading', { name: 'Read at the library' })).toBeInTheDocument();
  expect(screen.getByText('2 listed · not for loan')).toBeInTheDocument();
  expect(screen.getByText('333.7 K96m')).toBeInTheDocument();
  expect(screen.getByText('Sixth floor')).toBeInTheDocument();
  expect(screen.queryByText('Available at the library')).toBeNull();
});

it.each(['none', 'stale'] as const)('qualifies a %s non-lending observation', (freshness) => {
  show({ ...AVAILABLE, outcome: 'unknown', loanRestriction: 'not_for_loan', availableCopies: undefined, freshness });
  expect(screen.queryByRole('heading', { name: 'Read at the library' })).toBeNull();
  expect(screen.getByRole('heading', { name: 'Availability unavailable' })).toBeInTheDocument();
});

it('asks the reader to check the volume when several records share an ISBN', () => {
  show({ ...AVAILABLE, outcome: 'unknown', catalogMatchCount: 3, availableCopies: undefined });
  expect(screen.getByRole('heading', { name: 'Check the edition' })).toBeInTheDocument();
  expect(screen.getByText('Several catalog records share this ISBN. Check the edition and volume.')).toBeInTheDocument();
  expect(screen.queryByText(/available ·/)).toBeNull();
});

it('distinguishes mixed lending and non-lending holdings on a selected catalog record', () => {
  show({ ...AVAILABLE, lookupKind: 'catalog_record', matchKind: 'catalog_record', notForLoanCopies: 1,
    locations: [{ name: 'Third floor', availableCopies: 1, totalCopies: 1 }, { name: 'Fourth floor', notForLoanCopies: 1, totalCopies: 1 }] });
  expect(screen.getByText('Reference copies')).toBeInTheDocument();
  expect(screen.getByText('1 listed')).toBeInTheDocument();
  expect(screen.getByText('Third floor · 1 available')).toBeInTheDocument();
  expect(screen.getByText('Fourth floor · 1 not for loan')).toBeInTheDocument();
});

it('labels a non-ISBN reference record without demanding an ISBN scan', () => {
  show({ ...AVAILABLE, lookupKind: 'catalog_record', matchKind: 'catalog_record', outcome: 'unknown', loanRestriction: 'not_for_loan', availableCopies: undefined });
  expect(screen.getByRole('heading', { name: 'Read at the library' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Scan ISBN' })).toBeNull();
});

it('shows a verified title/author reference restriction and an explicit edition qualification for lending', () => {
  const view = show({ ...AVAILABLE, lookupKind: 'title_author', matchKind: 'verified_work', outcome: 'unknown', loanRestriction: 'not_for_loan', totalCopies: undefined, availableCopies: undefined });
  expect(screen.getByRole('heading', { name: 'Read at the library' })).toBeInTheDocument();
  view.unmount();
  show({ ...AVAILABLE, lookupKind: 'title_author', matchKind: 'verified_work', totalCopies: undefined, availableCopies: undefined });
  expect(screen.getByText('Title and author match; check the edition in the catalog.')).toBeInTheDocument();
});

it('keeps the shelf visible while lending rules are unconfirmed', () => {
  show({ ...AVAILABLE, lookupKind: 'title_author', matchKind: 'verified_work', outcome: 'unknown', totalCopies: undefined, availableCopies: undefined, locations: [{ name: 'CA', status: 'unknown' }] });
  expect(screen.getByRole('heading', { name: 'Check with the library' })).toBeInTheDocument();
  expect(screen.getByText('CA')).toBeInTheDocument();
  expect(screen.queryByText('Available at the library')).toBeNull();
});

it('directs an ISBN lookup to library title search when the catalog has no ISBN field', () => {
  show({ ...AVAILABLE, outcome: 'unknown', freshness: 'none', errorCode: 'CATALOG_TITLE_SEARCH_REQUIRED' });
  expect(screen.getByRole('link', { name: 'Search library catalog' })).toHaveAttribute('href', '/app/search');
  expect(screen.getByRole('heading', { name: 'Search by title' })).toBeInTheDocument();
});

it('distinguishes a known catalog record with no public holdings from an outage', () => {
  show({ ...AVAILABLE, lookupKind: 'catalog_record', matchKind: 'catalog_record', outcome: 'unknown', availableCopies: undefined, totalCopies: undefined });
  expect(screen.getByRole('heading', { name: 'Check with the library' })).toBeInTheDocument();
  expect(screen.getByText('This book is listed, but copy details aren’t available here.')).toBeInTheDocument();
  expect(screen.queryByText('Availability unavailable')).toBeNull();
});

it('does not imply reference copies are unavailable when lending copies are checked out', () => {
  show({ ...AVAILABLE, outcome: 'none_available', availableCopies: 0, notForLoanCopies: 1 });
  expect(screen.getByRole('heading', { name: 'No lending copies available' })).toBeInTheDocument();
  expect(screen.getByText('Reference copies')).toBeInTheDocument();
});

it('offers a catalog handoff for unsupported libraries and another library if no link exists', () => {
  const library = { ...LIBRARY, capabilities: { ...LIBRARY.capabilities, publicAvailability: false } };
  const view = show(null, library);
  expect(screen.getByRole('heading', { name: 'Check the library website' })).toBeInTheDocument();
  view.unmount(); show(null, { ...library, catalogUrl: undefined });
  expect(screen.getAllByRole('link', { name: 'Change library' })).toHaveLength(2);
});

it('shows the optional library choice with a return path', () => {
  show(null, null);
  expect(screen.getByRole('link', { name: 'Choose a library' })).toBeInTheDocument();
  expect(screen.queryByText('Available at the library')).toBeNull();
});

it('does not ask the reader to select a library while it is loading', () => {
  show(null, null, { loadingLibrary: true });
  expect(screen.getByText('Checking availability…')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Choose a library' })).toBeNull();
});

it('retries a failed library load without clearing the choice', () => {
  const onRetryLibrary = vi.fn();
  show(null, null, { libraryError: 'internal error', onRetryLibrary });
  expect(screen.getByRole('alert')).toHaveTextContent('Library details unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(onRetryLibrary).toHaveBeenCalledOnce();
  expect(screen.queryByText('internal error')).toBeNull();
});

it('omits health and freshness copy on a confirmed result', () => {
  show(AVAILABLE, { ...LIBRARY, health: 'degraded' });
  expect(screen.queryByText(/slow to update|Checked/)).toBeNull();
});
