import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAccountSession } from '../../auth/AccountSessionProvider';
import {
  AdminApiError, adminRequest, formatTime, FAILURE_CLASSES, REPORT_STATUSES, REQUEST_STATUSES,
  type AdminSummary, type HealthRow, type HealthView, type LibraryRequest, type ProblemReport, type ReportStatus,
  type ReportsView, type RequestStatus, type RequestsView, type UsageView,
} from './adminApi';
import './admin.css';

// The owner-only admin view (plan section 6) at /app/admin: a lazy chunk,
// linked from nowhere, noindex. The server decides who may see it; anyone
// else gets "Page not found" exactly as for an unknown address. Reader text
// (library requests, problem reports, search text) is untrusted and is only
// ever rendered as React text children, never as HTML.

type Tab = 'health' | 'usage' | 'requests' | 'reports' | 'summary';
const TABS: { id: Tab; label: string }[] = [
  { id: 'health', label: 'Library health' }, { id: 'usage', label: 'Usage' }, { id: 'requests', label: 'Library requests' },
  { id: 'reports', label: 'Problem reports' }, { id: 'summary', label: 'Summary' },
];

function useNoIndex() {
  useEffect(() => {
    const meta = document.querySelector('meta[name="robots"]');
    const before = meta?.getAttribute('content') ?? null;
    meta?.setAttribute('content', 'noindex, nofollow');
    const title = document.title;
    document.title = 'Admin — MyBookshelf';
    return () => { if (before !== null) meta?.setAttribute('content', before); document.title = title; };
  }, []);
}

function NotFound() {
  return <section className="page-section prose"><h1>Page not found</h1><Link className="button-link" to="/app/shelf">Back to the shelf</Link></section>;
}

function ErrorLine({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error instanceof AdminApiError ? error : null;
  return <p className="admin-alert" role="alert">{e ? e.message : 'Something went wrong.'}{e?.code ? ` (${e.code}${e.detail ? `: ${e.detail}` : ''})` : ''}</p>;
}

function StoreBanner({ summary }: { summary: AdminSummary }) {
  const { store } = summary;
  if (store.state === 'ok') return null;
  const title = store.state === 'not_configured' ? 'Catalog store not configured' : store.state === 'wrong_role' ? 'Wrong database role' : 'Catalog store unreachable';
  return <div className="admin-alert" role="alert">
    <strong>{title}.</strong> {store.message}{store.detail ? ` Error code: ${store.detail}.` : ''} Nothing below can be loaded until this is fixed.
  </div>;
}

function UsageLogNote({ enabled, hasData }: { enabled: boolean; hasData: boolean }) {
  if (hasData) return null;
  return <p className="admin-note" role="status">
    {enabled ? 'No usage data yet. The anonymous log is on; counts appear after the first searches and library checks.'
      : 'No usage data yet. The anonymous log is off (USAGE_LOG_ENABLED is not true), so searches and library checks are not counted.'}
  </p>;
}

function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return <section className="admin-section"><div className="admin-section-head"><h2>{title}</h2>{actions}</div>{children}</section>;
}

/** Loads one view; `reload` re-fetches it. */
function useView<T>(path: string, enabled: boolean) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    setLoading(true);
    try { setValue(await adminRequest<T>(path)); setError(null); } catch (failure) { setError(failure); } finally { setLoading(false); }
  }, [path]);
  useEffect(() => { if (enabled) void reload(); }, [enabled, reload]);
  return { value, error, loading, reload };
}

export function AdminPage() {
  useNoIndex();
  const { session } = useAccountSession();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState<Tab>('health');
  const loadSummary = useCallback(async () => {
    try { setSummary(await adminRequest<AdminSummary>('/summary')); setState('ready'); } catch (failure) {
      // Anyone but the owner gets the server's answer for any unknown /api
      // path (410 today), so both read as "not found".
      if (failure instanceof AdminApiError && (failure.status === 404 || failure.status === 410)) setState('missing');
      else { setError(failure); setState('error'); }
    }
  }, []);
  const checking = session.status === 'checking';
  useEffect(() => { if (!checking) void loadSummary(); }, [checking, loadSummary, session.epoch]);
  if (checking || state === 'loading') return <section className="page-section"><p role="status">Loading…</p></section>;
  if (state === 'missing') return <NotFound />;
  if (state === 'error' || !summary) return <section className="page-section admin"><h1>Admin</h1><ErrorLine error={error} /></section>;
  const csrf = session.csrfToken;
  const storeOk = summary.store.state === 'ok';
  return <section className="page-section admin" aria-labelledby="admin-title">
    <h1 id="admin-title">Admin</h1>
    <StoreBanner summary={summary} />
    <nav className="admin-tabs" aria-label="Admin views">
      {TABS.map(item => <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>
        {item.label}{item.id === 'health' && summary.counts?.flaggedUnacknowledged ? ` (${summary.counts.flaggedUnacknowledged} new)` : ''}
        {item.id === 'requests' && summary.counts?.openRequests ? ` (${summary.counts.openRequests} open)` : ''}
        {item.id === 'reports' && summary.counts?.newReports ? ` (${summary.counts.newReports} new)` : ''}
      </button>)}
    </nav>
    {tab === 'health' && <HealthTab enabled={storeOk} csrf={csrf} onChange={loadSummary} />}
    {tab === 'usage' && <UsageTab enabled={storeOk} usageLogEnabled={summary.usageLogEnabled} />}
    {tab === 'requests' && <RequestsTab enabled={storeOk} csrf={csrf} onChange={loadSummary} />}
    {tab === 'reports' && <ReportsTab enabled={storeOk} csrf={csrf} onChange={loadSummary} />}
    {tab === 'summary' && <SummaryTab summary={summary} />}
  </section>;
}

export default AdminPage;

// ---- Library health ------------------------------------------------------

function HealthTab({ enabled, csrf, onChange }: { enabled: boolean; csrf?: string; onChange: () => void }) {
  const view = useView<HealthView>('/library-health', enabled);
  if (!enabled) return null;
  const rows = view.value?.libraries || [];
  const flagged = rows.filter(row => row.flagged);
  const others = rows.filter(row => !row.flagged);
  return <>
    <ErrorLine error={view.error} />
    {view.value && !view.value.checkTotalsFromLog && <p className="admin-note">Check totals and failure rates need the anonymous log; only failures are counted here.</p>}
    <Section title={`Flagged as failing (${flagged.length})`} actions={<a className="admin-link" href="/api/admin/library-health.csv" download>Download CSV</a>}>
      {view.loading && !view.value ? <p role="status">Loading…</p> : flagged.length ? flagged.map(row => <FlaggedLibrary key={row.libraryId} row={row} csrf={csrf} onSaved={() => { void view.reload(); onChange(); }} />)
        : <p>No library is flagged.</p>}
    </Section>
    <Section title={`Libraries checked in the last 7 days (${others.length})`}>
      {others.length ? <div className="admin-scroll"><table className="admin-table">
        <thead><tr><th scope="col">Library</th><th scope="col">Platform</th><th scope="col">Failures 7d</th><th scope="col">Checks 7d</th><th scope="col">Failure rate</th><th scope="col">Last success</th><th scope="col">Last failure</th><th scope="col">Note</th></tr></thead>
        <tbody>{others.map(row => <tr key={row.libraryId}>
          <td><LibraryName id={row.libraryId} name={row.name} /></td><td>{row.platform}</td><td>{row.failures7d}</td><td>{row.checks7d ?? '—'}</td>
          <td>{row.failureRate == null ? '—' : `${Math.round(row.failureRate * 100)}%`}</td><td>{formatTime(row.lastSuccessAt)}</td>
          <td>{formatTime(row.lastFailureAt)}{row.lastFailure ? ` (${row.lastFailure})` : ''}</td><td>{row.ownerNote || ''}</td>
        </tr>)}</tbody></table></div> : <p>None.</p>}
    </Section>
  </>;
}

function LibraryName({ id, name }: { id: string | null; name: string | null }) {
  if (!id) return <>—</>;
  return <>{name ? <>{name} <span className="admin-muted">{id}</span></> : <span>{id}</span>}</>;
}

function FlaggedLibrary({ row, csrf, onSaved }: { row: HealthRow; csrf?: string; onSaved: () => void }) {
  const [note, setNote] = useState(row.ownerNote || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const save = async (acknowledged?: boolean) => {
    setSaving(true);
    try {
      await adminRequest(`/library-health/${encodeURIComponent(row.libraryId)}`, { method: 'PATCH', csrf, body: { ...(acknowledged === undefined ? {} : { acknowledged }), note } });
      setError(null); onSaved();
    } catch (failure) { setError(failure); } finally { setSaving(false); }
  };
  const classes = FAILURE_CLASSES.filter(name => row.failuresByClass[name]).map(name => `${name} ${row.failuresByClass[name]}`).join(', ');
  return <article className="admin-card" aria-label={row.name || row.libraryId}>
    <h3><LibraryName id={row.libraryId} name={row.name} /></h3>
    <dl className="admin-facts">
      <div><dt>Platform</dt><dd>{row.platform}{row.host ? ` · ${row.host}` : ''}</dd></div>
      <div><dt>Flag</dt><dd>{row.flagReason || '—'} (since {formatTime(row.flaggedAt)})</dd></div>
      <div><dt>Failures in 7 days</dt><dd>{row.failures7d}{classes ? ` — ${classes}` : ''}{row.checks7d != null ? ` of ${row.checks7d} checks` : ''}</dd></div>
      <div><dt>Last success</dt><dd>{formatTime(row.lastSuccessAt)}</dd></div>
      <div><dt>Median time</dt><dd>{row.medianMs != null ? `${row.medianMs} ms` : row.medianFailureMs != null ? `${row.medianFailureMs} ms (failed checks)` : '—'}</dd></div>
      <div><dt>Acknowledged</dt><dd>{row.acknowledgedAt ? formatTime(row.acknowledgedAt) : 'Not yet'}</dd></div>
    </dl>
    {row.recentFailures.length > 0 && <>
      <h4>Recent failures</h4>
      <ul className="admin-list">{row.recentFailures.map(item => <li key={item.occurredAt + item.failure}>
        {formatTime(item.occurredAt)} — {item.failure}{item.errorCode ? ` (${item.errorCode})` : ''}, {item.operation.replace('_', ' ')}, {item.durationMs} ms, {item.requests} {item.requests === 1 ? 'request' : 'requests'}
      </li>)}</ul>
    </>}
    <div className="admin-row">
      <label>Note <input value={note} maxLength={500} onChange={event => setNote(event.target.value)} /></label>
      {row.acknowledgedAt
        ? <button type="button" disabled={saving} onClick={() => void save(false)}>Mark as not seen</button>
        : <button type="button" disabled={saving} onClick={() => void save(true)}>Acknowledge</button>}
      <button type="button" disabled={saving} onClick={() => void save()}>Save note</button>
    </div>
    <ErrorLine error={error} />
  </article>;
}

// ---- Usage -----------------------------------------------------------

function UsageTab({ enabled, usageLogEnabled }: { enabled: boolean; usageLogEnabled: boolean }) {
  const view = useView<UsageView>('/usage', enabled);
  if (!enabled) return null;
  const value = view.value;
  return <>
    <ErrorLine error={view.error} />
    {!value ? (view.loading ? <p role="status">Loading…</p> : null) : <>
      <UsageLogNote enabled={usageLogEnabled} hasData={value.hasData} />
      <Section title={`Per day, last ${value.days} days (UTC)`}>
        {value.daily.length ? <div className="admin-scroll"><table className="admin-table">
          <thead><tr><th scope="col">Day</th><th scope="col">Searches</th><th scope="col">No results</th><th scope="col">Library checks</th><th scope="col">Result markings</th><th scope="col">Library finder</th><th scope="col">Near me</th></tr></thead>
          <tbody>{value.daily.map(day => <tr key={day.day}><td>{day.day}</td><td>{day.book_search}</td><td>{day.searchesWithoutResults}</td><td>{day.book_check}</td><td>{day.result_marks}</td><td>{day.library_finder}</td><td>{day.near_me}</td></tr>)}</tbody>
        </table></div> : <p>No days with data.</p>}
      </Section>
      <Section title="Searches with no results">
        <CountList rows={value.noResultSearches} />
      </Section>
      <Section title="Library checks by outcome">
        {value.libraryChecks.length ? <div className="admin-scroll"><table className="admin-table">
          <thead><tr><th scope="col">Library</th><th scope="col">Outcome</th><th scope="col">Checks</th><th scope="col">p50</th><th scope="col">p95</th></tr></thead>
          <tbody>{value.libraryChecks.map(row => <tr key={row.libraryId + row.outcome}><td><LibraryName id={row.libraryId} name={row.name} /></td><td>{row.outcome}</td><td>{row.events}</td>
            <td>{row.p50Ms == null ? '—' : `${row.p50Ms} ms`}</td><td>{row.p95Ms == null ? '—' : `${row.p95Ms} ms`}</td></tr>)}</tbody>
        </table></div> : <p>None.</p>}
      </Section>
      <Section title="Result marking">
        <p>{value.marking.runs ? `${value.marking.booksMarked} of ${value.marking.booksShown} books shown were marked, in ${value.marking.runs} ${value.marking.runs === 1 ? 'search' : 'searches'}.` : 'None.'}</p>
      </Section>
      <Section title="Library-finder searches with no results">
        <CountList rows={value.libraryFinderWithoutResults} />
      </Section>
    </>}
  </>;
}

function CountList({ rows }: { rows: { text: string; count: number }[] }) {
  if (!rows.length) return <p>None.</p>;
  return <ol className="admin-list">{rows.map(row => <li key={row.text}><span className="admin-text">{row.text}</span> — {row.count}</li>)}</ol>;
}

// ---- Library requests --------------------------------------------------

function RequestsTab({ enabled, csrf, onChange }: { enabled: boolean; csrf?: string; onChange: () => void }) {
  const view = useView<RequestsView>('/library-requests', enabled);
  if (!enabled) return null;
  const groups = view.value?.groups || [];
  return <>
    <ErrorLine error={view.error} />
    <p className="admin-note">Requests that share a place or library name, allowing for one typing slip, are shown together. Each keeps its own count and status.</p>
    {view.loading && !view.value ? <p role="status">Loading…</p> : groups.length ? groups.map(group => <section className="admin-card" key={group.requests[0].requestKey} aria-label={group.label}>
      <h3><span className="admin-text">{group.label}</span> <span className="admin-muted">— {group.totalCount} {group.totalCount === 1 ? 'request' : 'requests'}, last {group.lastRequestedOn}</span></h3>
      {group.words.length > 0 && <p className="admin-muted">Shared words: {group.words.join(', ')}</p>}
      <div className="admin-scroll"><table className="admin-table">
        <thead><tr><th scope="col">Typed text</th><th scope="col">Count</th><th scope="col">First</th><th scope="col">Last</th><th scope="col">Status and note</th></tr></thead>
        <tbody>{group.requests.map(request => <RequestRow key={request.requestKey} request={request} csrf={csrf} onSaved={() => { void view.reload(); onChange(); }} />)}</tbody>
      </table></div>
    </section>) : <p>No library requests yet.</p>}
  </>;
}

function RequestRow({ request, csrf, onSaved }: { request: LibraryRequest; csrf?: string; onSaved: () => void }) {
  const [status, setStatus] = useState<RequestStatus>(request.status);
  const [note, setNote] = useState(request.statusNote || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const changed = status !== request.status || note !== (request.statusNote || '');
  const save = async () => {
    setSaving(true);
    try { await adminRequest(`/library-requests/${encodeURIComponent(request.requestKey)}`, { method: 'PATCH', csrf, body: { status, note } }); setError(null); onSaved(); }
    catch (failure) { setError(failure); } finally { setSaving(false); }
  };
  return <tr>
    <td className="admin-text">{request.displayText}</td><td>{request.requestCount}</td><td>{request.firstRequestedOn}</td><td>{request.lastRequestedOn}</td>
    <td><div className="admin-row">
      <label><span className="admin-visually-hidden">Status for {request.displayText}</span>
        <select value={status} onChange={event => setStatus(event.target.value as RequestStatus)}>{REQUEST_STATUSES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label><span className="admin-visually-hidden">Note for {request.displayText}</span>
        <input value={note} maxLength={500} placeholder="Note" onChange={event => setNote(event.target.value)} /></label>
      <button type="button" disabled={!changed || saving} onClick={() => void save()}>Save</button>
    </div><ErrorLine error={error} /></td>
  </tr>;
}

// ---- Problem reports ---------------------------------------------------

function ReportsTab({ enabled, csrf, onChange }: { enabled: boolean; csrf?: string; onChange: () => void }) {
  const view = useView<ReportsView>('/problem-reports', enabled);
  if (!enabled) return null;
  const reports = view.value?.reports || [];
  return <>
    <ErrorLine error={view.error} />
    {view.loading && !view.value ? <p role="status">Loading…</p> : reports.length ? reports.map(report => <Report key={report.id} report={report} csrf={csrf} onSaved={() => { void view.reload(); onChange(); }} />)
      : <p>No problem reports yet.</p>}
  </>;
}

function Report({ report, csrf, onSaved }: { report: ProblemReport; csrf?: string; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const change = async (status: ReportStatus) => {
    setSaving(true);
    try { await adminRequest(`/problem-reports/${encodeURIComponent(report.id)}`, { method: 'PATCH', csrf, body: { status } }); setError(null); onSaved(); }
    catch (failure) { setError(failure); } finally { setSaving(false); }
  };
  return <article className="admin-card" aria-label={`Report from ${formatTime(report.createdAt)}`}>
    <p className="admin-body">{report.body}</p>
    <dl className="admin-facts">
      <div><dt>Sent</dt><dd>{formatTime(report.createdAt)}</dd></div>
      <div><dt>Screen</dt><dd>{report.screen || '—'}</dd></div>
      <div><dt>Library</dt><dd><LibraryName id={report.libraryId} name={report.libraryName} /></dd></div>
      <div><dt>Book</dt><dd>{report.bookKey ? <Link to={`/app/books/${encodeURIComponent(report.bookKey)}`}>{report.bookKey}</Link> : '—'}</dd></div>
      <div><dt>App version</dt><dd>{report.appVersion || '—'}</dd></div>
    </dl>
    <div className="admin-row">
      <label>Status <select value={report.status} disabled={saving} onChange={event => void change(event.target.value as ReportStatus)}>
        {REPORT_STATUSES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      {report.resolvedAt && <span className="admin-muted">since {formatTime(report.resolvedAt)}</span>}
    </div>
    <ErrorLine error={error} />
  </article>;
}

// ---- Summary -------------------------------------------------------------

function SummaryTab({ summary }: { summary: AdminSummary }) {
  const counts = summary.counts;
  return <>
    {counts && <Section title="Totals">
      <ul className="admin-list">
        <li>Stored library answers: {counts.storedAnswers}</li>
        <li>Libraries flagged: {counts.flaggedLibraries} ({counts.flaggedUnacknowledged} not acknowledged)</li>
        <li>Open library requests: {counts.openRequests}</li>
        <li>New problem reports: {counts.newReports}</li>
      </ul>
    </Section>}
    <UsageLogNote enabled={summary.usageLogEnabled} hasData={Boolean(counts?.usageData)} />
    {counts && <Section title="Stored answers per library">
      {summary.answersByLibrary.length ? <div className="admin-scroll"><table className="admin-table">
        <thead><tr><th scope="col">Library</th><th scope="col">Found</th><th scope="col">Not found</th></tr></thead>
        <tbody>{summary.answersByLibrary.map(row => <tr key={row.libraryId}><td><LibraryName id={row.libraryId} name={row.name} /></td><td>{row.found}</td><td>{row.notFound}</td></tr>)}</tbody>
      </table></div> : <p>None yet.</p>}
    </Section>}
    <Section title="Libraries that asked us not to store answers">
      {summary.optedOut.length ? <ul className="admin-list">{summary.optedOut.map(row => <li key={row.libraryId}><LibraryName id={row.libraryId} name={row.name} /></li>)}</ul> : <p>None (server/data/catalog-policies.json).</p>}
    </Section>
  </>;
}
