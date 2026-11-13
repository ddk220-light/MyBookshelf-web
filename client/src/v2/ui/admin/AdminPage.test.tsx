import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminPage } from './AdminPage';

const ok = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
const fail = (status: number, code: string, message = 'x', detail?: string) =>
  new Response(JSON.stringify({ error: { code, message, detail } }), { status, headers: { 'Content-Type': 'application/json' } });

const summary = (store: object = { state: 'ok' }, extra: object = {}) => ({
  store, usageLogEnabled: false, counts: { openRequests: 1, newReports: 1, flaggedLibraries: 0, flaggedUnacknowledged: 0, storedAnswers: 0, usageData: false },
  answersByLibrary: [], optedOut: [], ...extra,
});

function mount(routes: Record<string, () => Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const path = url.replace('/api/admin', '');
    const handler = routes[`${init?.method || 'GET'} ${path}`] || routes[path];
    return handler ? handler() : fail(404, 'NOT_FOUND');
  }));
  render(<MemoryRouter><AdminPage /></MemoryRouter>);
  return calls;
}

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('AdminPage', () => {
  it('shows the ordinary "Page not found" when the server says 404', async () => {
    mount({});
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(screen.queryByText(/Admin/)).toBeNull();
  });

  it('shows the same "Page not found" for the server answer to any unknown /api path (410)', async () => {
    mount({ '/summary': () => fail(410, 'LEGACY_API_RETIRED') });
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says plainly when the catalog store is not configured or unreachable', async () => {
    mount({ '/summary': () => ok(summary({ state: 'not_configured', code: 'STORE_NOT_CONFIGURED', message: 'The catalog store is not configured for the admin view (CATALOG_ADMIN_DATABASE_URL is not set).' }, { counts: null })) });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Catalog store not configured/);
    expect(alert.textContent).toMatch(/CATALOG_ADMIN_DATABASE_URL/);
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    mount({ '/summary': () => ok(summary({ state: 'unreachable', code: 'STORE_UNREACHABLE', detail: 'ECONNREFUSED', message: 'The catalog store could not be reached.' }, { counts: null })) });
    expect((await screen.findByRole('alert')).textContent).toMatch(/unreachable.*ECONNREFUSED/s);
  });

  it('shows reader text as text, never as HTML', async () => {
    const body = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    mount({
      '/summary': () => ok(summary()),
      '/library-health': () => ok({ usageLogEnabled: false, checkTotalsFromLog: false, libraries: [] }),
      '/problem-reports': () => ok({ reports: [{ id: '11111111-2222-4333-8444-555555555555', body, screen: 'book', libraryId: null, libraryName: null,
        bookKey: 'v1:isbn:9780140328721', appVersion: 'abc1234', createdAt: '2026-11-13T09:00:00Z', status: 'new', resolvedAt: null }] }),
      '/library-requests': () => ok({ total: 1, groups: [{ label: '<b>Pune</b>', words: [], totalCount: 1, lastRequestedOn: '2026-11-13',
        requests: [{ requestKey: 'b pune b', displayText: '<b>Pune</b>', requestCount: 1, firstRequestedOn: '2026-11-13', lastRequestedOn: '2026-11-13', status: 'open', statusNote: null, updatedAt: '' }] }] }),
    });
    fireEvent.click(await screen.findByRole('button', { name: /Problem reports/ }));
    expect(await screen.findByText(body)).toBeTruthy();
    expect(document.querySelector('script, img')).toBeNull();
    expect(screen.getByRole('link', { name: 'v1:isbn:9780140328721' }).getAttribute('href')).toBe('/app/books/v1%3Aisbn%3A9780140328721');
    fireEvent.click(screen.getByRole('button', { name: /Library requests/ }));
    expect((await screen.findAllByText('<b>Pune</b>')).length).toBeGreaterThan(0);
    expect(document.querySelector('.admin b')).toBeNull();
  });

  it('says there is no usage data yet while the log is off', async () => {
    mount({
      '/summary': () => ok(summary()),
      '/library-health': () => ok({ usageLogEnabled: false, checkTotalsFromLog: false, libraries: [] }),
      '/usage': () => ok({ usageLogEnabled: false, days: 30, hasData: false, daily: [], noResultSearches: [], libraryChecks: [], marking: { runs: 0, booksShown: 0, booksMarked: 0 }, libraryFinderWithoutResults: [] }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Usage' }));
    expect((await screen.findByText(/No usage data yet/)).textContent).toMatch(/USAGE_LOG_ENABLED/);
  });

  it('acknowledges a flagged library with a PATCH', async () => {
    const row = { libraryId: 'koha:slow', name: 'Slow Library', platform: 'koha', host: 'slow.example', flagged: true, flaggedAt: '2026-11-13T08:00:00Z',
      flagReason: '3 failed attempts on 2 days within 7 days', failures7d: 3, failuresByClass: { timeout: 2, unavailable: 1, blocked: 0, unrecognized: 0, budget: 0, configuration: 0 },
      checks7d: null, failureRate: null, medianMs: null, medianFailureMs: 20000, lastSuccessAt: null, lastFailureAt: '2026-11-13T08:00:00Z', lastFailure: 'timeout',
      failuresSinceSuccess: 3, acknowledgedAt: null, ownerNote: null, recentFailures: [{ occurredAt: '2026-11-13T08:00:00Z', operation: 'book_check', failure: 'timeout', errorCode: 'CATALOG_TIMEOUT', durationMs: 20000, requests: 3 }] };
    const calls = mount({
      '/summary': () => ok(summary()),
      '/library-health': () => ok({ usageLogEnabled: false, checkTotalsFromLog: false, libraries: [row] }),
      'PATCH /library-health/koha%3Aslow': () => ok({ libraryId: 'koha:slow', acknowledgedAt: '2026-11-13T09:00:00Z', ownerNote: null }),
    });
    expect(await screen.findByText(/timeout 2, unavailable 1/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(calls.some(call => call.init?.method === 'PATCH')).toBe(true));
    const patch = calls.find(call => call.init?.method === 'PATCH')!;
    expect(JSON.parse(String(patch.init?.body))).toEqual({ acknowledged: true, note: '' });
  });
});
