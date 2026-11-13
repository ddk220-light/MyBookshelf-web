// The owner-only admin view's API client (plan section 6). Same-origin, with
// the account session cookie; changes send the session's CSRF token. Every
// value from the server is shown as text by React, never as HTML.

export type StoreState = { state: 'ok' | 'not_configured' | 'unreachable' | 'wrong_role'; code?: string; detail?: string | null; message?: string };

export type AdminSummary = {
  store: StoreState;
  usageLogEnabled: boolean;
  counts: null | { openRequests: number; newReports: number; flaggedLibraries: number; flaggedUnacknowledged: number; storedAnswers: number; usageData: boolean };
  answersByLibrary: { libraryId: string; name: string | null; found: number; notFound: number }[];
  optedOut: { libraryId: string; name: string | null }[];
};

export type FailureClass = 'timeout' | 'unavailable' | 'blocked' | 'unrecognized' | 'budget' | 'configuration';
export const FAILURE_CLASSES: FailureClass[] = ['timeout', 'unavailable', 'blocked', 'unrecognized', 'budget', 'configuration'];

export type HealthRow = {
  libraryId: string; name: string | null; platform: string; host: string | null;
  flagged: boolean; flaggedAt: string | null; flagReason: string | null;
  failures7d: number; failuresByClass: Record<FailureClass, number>; checks7d: number | null; failureRate: number | null;
  medianMs: number | null; medianFailureMs: number | null;
  lastSuccessAt: string | null; lastFailureAt: string | null; lastFailure: string | null; failuresSinceSuccess: number;
  acknowledgedAt: string | null; ownerNote: string | null;
  recentFailures: { occurredAt: string; operation: string; failure: string; errorCode: string | null; durationMs: number; requests: number }[];
};
export type HealthView = { usageLogEnabled: boolean; checkTotalsFromLog: boolean; libraries: HealthRow[] };

export const REQUEST_STATUSES = ['open', 'added', 'declined', 'spam'] as const;
export type RequestStatus = typeof REQUEST_STATUSES[number];
export type LibraryRequest = { requestKey: string; displayText: string; requestCount: number; firstRequestedOn: string; lastRequestedOn: string;
  status: RequestStatus; statusNote: string | null; updatedAt: string };
export type RequestGroup = { label: string; words: string[]; totalCount: number; lastRequestedOn: string; requests: LibraryRequest[] };
export type RequestsView = { total: number; groups: RequestGroup[] };

export const REPORT_STATUSES = ['new', 'read', 'resolved', 'spam'] as const;
export type ReportStatus = typeof REPORT_STATUSES[number];
export type ProblemReport = { id: string; body: string; screen: string | null; libraryId: string | null; libraryName: string | null;
  bookKey: string | null; appVersion: string | null; createdAt: string; status: ReportStatus; resolvedAt: string | null };
export type ReportsView = { reports: ProblemReport[] };

export type UsageDay = { day: string; book_search: number; book_check: number; result_marks: number; library_finder: number; near_me: number; searchesWithoutResults: number };
export type UsageView = {
  usageLogEnabled: boolean; days: number; hasData: boolean; daily: UsageDay[];
  noResultSearches: { text: string; count: number }[];
  libraryChecks: { libraryId: string; name: string | null; outcome: string; events: number; p50Ms: number | null; p95Ms: number | null }[];
  marking: { runs: number; booksShown: number; booksMarked: number };
  libraryFinderWithoutResults: { text: string; count: number }[];
};

export class AdminApiError extends Error {
  constructor(public status: number, public code: string, message: string, public detail: string | null = null) { super(message); }
}

export async function adminRequest<T>(path: string, { method = 'GET', body, csrf }: { method?: string; body?: unknown; csrf?: string } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/admin' + path, {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'X-Account-CSRF': csrf } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new AdminApiError(0, 'NETWORK_ERROR', 'Couldn’t connect. Check your connection and try again.');
  }
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    const error = value?.error;
    throw new AdminApiError(response.status, typeof error?.code === 'string' ? error.code : 'ADMIN_UNAVAILABLE',
      typeof error?.message === 'string' ? error.message : 'The admin view is temporarily unavailable.', typeof error?.detail === 'string' ? error.detail : null);
  }
  return value as T;
}

/** "2026-11-13 09:05 UTC", the same everywhere. */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}
