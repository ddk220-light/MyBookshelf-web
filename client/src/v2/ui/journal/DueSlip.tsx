import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { Availability, PublicLibrary } from '../../types';
import { catalogMessages } from '../../catalogMessages';
import { uiMessages as m } from '../../uiMessages';
import { libraryReturn } from '../../bookNavigation';

export function catalogStatus(a: Availability): { title: string; note?: string; tone: string } {
  if (a.freshness === 'stale' || (a.errorCode && !['CATALOG_TITLE_SEARCH_REQUIRED', 'CATALOG_EXACT_ISBN_REQUIRED'].includes(a.errorCode))) return {
    title: a.errorCode === 'CATALOG_TIMEOUT' ? 'Catalog timed out' : catalogMessages.cannotCheck,
    note: 'Try again or open the library catalog.', tone: 'unknown',
  };
  if (a.errorCode === 'CATALOG_TITLE_SEARCH_REQUIRED') return {
    title: catalogMessages.titleSearchNeeded, note: catalogMessages.titleSearchExplanation, tone: 'unknown',
  };
  if (a.lookupKind === 'title_author' && a.matchKind === 'verified_work' && a.freshness === 'fresh') {
    if (a.loanRestriction === 'not_for_loan' && a.outcome === 'unknown') return {
      title: catalogMessages.notForLoan, note: catalogMessages.notForLoanNote, tone: 'unknown',
    };
    if (a.outcome === 'unknown') return { title: catalogMessages.checkCatalog, note: catalogMessages.titleAuthorUnknown, tone: 'unknown' };
  }
  // A possible edition and an old observation must never look like a current exact result.
  if (a.matchKind === 'possible_match') return { title: catalogMessages.checkEdition, note: catalogMessages.similarEdition, tone: 'unknown' };
  if (a.loanRestriction === 'not_for_loan' && a.outcome === 'unknown' && ['exact_isbn', 'catalog_record', 'verified_work'].includes(a.matchKind || '') && a.freshness !== 'none') return {
    title: catalogMessages.notForLoan,
    note: catalogMessages.notForLoanNote,
    tone: 'unknown',
  };
  if (a.catalogMatchCount && a.catalogMatchCount > 1 && a.outcome === 'unknown' && a.matchKind === 'exact_isbn' && a.freshness === 'fresh') return {
    title: catalogMessages.checkEdition, note: catalogMessages.severalEditions, tone: 'unknown',
  };
  if (a.outcome === 'unknown' && a.matchKind === 'catalog_record' && a.freshness === 'fresh') return {
    title: catalogMessages.checkCatalog, note: catalogMessages.knownRecord, tone: 'unknown',
  };
  if (a.outcome === 'unknown' || a.freshness === 'none') return {
    title: a.errorCode === 'CATALOG_EXACT_ISBN_REQUIRED' ? catalogMessages.isbnNeeded : catalogMessages.cannotCheck,
    note: a.errorCode === 'CATALOG_EXACT_ISBN_REQUIRED' ? catalogMessages.isbnNote : catalogMessages.cannotCheckNote,
    tone: 'unknown',
  };
  if (a.outcome === 'none_available' && a.notForLoanCopies) return { title: catalogMessages.noLending, note: catalogMessages.noLendingNote, tone: 'none_available' };
  const status = {
    available: { title: catalogMessages.available, tone: 'available' },
    none_available: { title: catalogMessages.noLending, note: catalogMessages.unavailableNote, tone: 'none_available' },
    in_catalog: { title: catalogMessages.inCatalog, note: catalogMessages.inCatalogNote, tone: 'unknown' },
    no_match: { title: catalogMessages.noMatch, note: catalogMessages.noMatchNote, tone: 'not_found' },
    not_found: { title: catalogMessages.notListed, note: catalogMessages.notListedNote, tone: 'not_found' },
  }[a.outcome];
  return a.lookupKind === 'title_author' ? { ...status, note: catalogMessages.titleAuthorMatch } : status;
}

export function accessSummary(note?: string): string | undefined {
  if (!note) return undefined;
  if (/reference|cannot be borrowed|on.site use/i.test(note)) return catalogMessages.referenceAccess;
  if (/borrow|membership|campus access|registration/i.test(note)) return catalogMessages.accessRules;
  return undefined;
}

export function CatalogDetails({ library, availability, saved, showIdentity = true, showChange = true }: { library: PublicLibrary | null; availability: Availability | null; saved: boolean; showIdentity?: boolean; showChange?: boolean }) {
  const location = useLocation();
  const restricted = availability?.loanRestriction === 'not_for_loan' && availability.outcome === 'unknown'
    && (['exact_isbn', 'catalog_record', 'verified_work'].includes(availability.matchKind || '') || (availability.lookupKind === 'title_author' && availability.matchKind === 'verified_work'));
  const confirmed = availability && library?.capabilities.publicAvailability && availability.freshness === 'fresh' && !availability.errorCode && availability.matchKind !== 'possible_match'
    && (availability.outcome === 'available' || availability.outcome === 'in_catalog' || availability.outcome === 'none_available' || restricted
      || (availability.lookupKind === 'title_author' && availability.matchKind === 'verified_work'));
  return <>
    {showIdentity && <><h2 className="page-label">{m.libraryDetails}</h2>
      <p className="page-place">{library?.name || (saved ? 'Saved for later' : 'Your next read')}</p>
      {library?.city && <p className="library-city">{[library.city, library.region].filter(Boolean).join(', ')}</p>}
    </>}
    {confirmed && <dl className="slip-facts">
      {availability.availableCopies !== undefined && <><dt>Copies</dt><dd>{availability.availableCopies} available{availability.totalCopies !== undefined ? ` · ${availability.totalCopies} total` : ''}</dd></>}
      {!restricted && availability.notForLoanCopies !== undefined && <><dt>{catalogMessages.referenceCopies}</dt><dd>{availability.notForLoanCopies} listed</dd></>}
      {restricted && availability.availableCopies === undefined && availability.totalCopies !== undefined && <><dt>Copies</dt><dd>{availability.totalCopies} listed · not for loan</dd></>}
      {availability.callNumber && <><dt>Call number</dt><dd>{availability.callNumber}</dd></>}
      {availability.format && <><dt>Format</dt><dd>{availability.format}</dd></>}
    </dl>}
    {confirmed && availability.locations?.length ? <><h3 className="location-heading">{catalogMessages.locationHeading}</h3><ul className="location-list">{availability.locations.map((item) => <li key={item.name}>{item.name}{item.availableCopies !== undefined ? ` · ${item.availableCopies} available` : ''}{item.notForLoanCopies !== undefined ? ` · ${item.notForLoanCopies} not for loan` : ''}</li>)}</ul></> : null}
    {library?.address && <p className="access-note">{library.address}</p>}
    {library && showChange && <Link className="text-link" to={`/app/libraries?book=${encodeURIComponent(decodeURIComponent(location.pathname.split('/').pop() || ''))}`} state={libraryReturn(location.pathname, location.search, location.state)}>{m.changeLibrary}</Link>}
    {accessSummary(library?.accessNote) && <p className="access-note">{accessSummary(library?.accessNote)}</p>}
  </>;
}

export function DueSlip({ library, availability, error, loadingLibrary, libraryError, onRetryLibrary, onRetry, showIdentity = true, lookupKey = '' }: {
  library: PublicLibrary | null; availability: Availability | null; error: string | null;
  loadingLibrary: boolean; libraryError: string | null; onRetryLibrary: () => void;
  showIdentity?: boolean; lookupKey?: string; onRetry?: () => void;
}) {
  const location = useLocation();
  const pending = loadingLibrary || Boolean(library?.capabilities.publicAvailability && !libraryError && !error && !availability);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!pending) return;
    const timer = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(timer);
  }, [pending, lookupKey, library?.id]);
  const navigate = useNavigate();
  const returnToBook = libraryReturn(location.pathname, location.search, location.state);
  const libraryPath = `/app/libraries?book=${encodeURIComponent(decodeURIComponent(location.pathname.split('/').pop() || ''))}`;
  const catalogUrl = availability?.catalogUrl || library?.catalogUrl;
  const status = loadingLibrary ? { title: catalogMessages.checking, tone: 'unknown' }
    : libraryError ? { title: catalogMessages.libraryLoadError, tone: 'unknown' }
    : !library ? { title: 'Is it at your library?', note: catalogMessages.chooseToCheckNote, tone: 'unknown' }
    : !library.capabilities.publicAvailability ? { title: catalogUrl ? catalogMessages.externalCatalog : catalogMessages.noOnlineCatalog, tone: 'unknown' }
    : error ? availability ? catalogStatus(availability) : { title: catalogMessages.cannotCheck, note: catalogMessages.cannotCheckNote, tone: 'unknown' }
    : !availability ? { title: catalogMessages.checking, tone: 'unknown' }
    : catalogStatus(availability);
  const needsIsbn = availability?.errorCode === 'CATALOG_EXACT_ISBN_REQUIRED';
  const needsTitle = availability?.errorCode === 'CATALOG_TITLE_SEARCH_REQUIRED';
  return <aside className={`due-slip availability-card availability-${status.tone}${availability?.loanRestriction === 'not_for_loan' ? ' availability-reference' : ''}`}  aria-label={library ? `Library availability at ${library.name}` : 'Library availability'}>
    {showIdentity && <><p className="eyebrow">{m.availability}</p>
      {library && <p className="availability-library">{library.name}</p>}
    </>}
    {pending ? <div className="availability-progress" role="status"><span className="checking-dot" aria-hidden="true" /><span>{status.title}{slow && <small>{m.slowCatalog}</small>}</span></div>
      : <h2 className={`availability-heading${library ? ` outcome-stamp outcome-stamp-${status.tone}` : ''}`} role={error || libraryError ? 'alert' : undefined}><span className="availability-status-symbol" aria-hidden="true">{status.tone === 'available' ? '✓' : '●'}</span>{status.title}</h2>}
    {'note' in status && status.note && <p className="slip-explanation">{status.note}</p>}
    {availability?.matchedBook?.isbn13 && availability.matchKind === 'verified_work' && availability.freshness === 'fresh' && !availability.errorCode && <p className="slip-explanation">{m.matchingEdition(availability.matchedBook.isbn13)}</p>}
    {(error || availability?.errorCode || availability?.freshness === 'stale') && onRetry && <button className="button-quiet" onClick={onRetry}>Retry</button>}
    {libraryError ? <button className="button-quiet" onClick={onRetryLibrary}>Try again</button>
      : loadingLibrary ? null
      : !library ? <><form action="/app/libraries" onSubmit={event => { event.preventDefault(); const query = String(new FormData(event.currentTarget).get('q') || '').slice(0, 120); navigate(libraryPath + '&q=' + encodeURIComponent(query), { state: returnToBook }); }}><input type="hidden" name="book" value={decodeURIComponent(location.pathname.split('/').pop() || '')} /><label>Library, city or postcode<input type="search" name="q" placeholder="Find your library" /></label><button>Find library</button></form><Link className="text-link" to={libraryPath} state={returnToBook}>{m.chooseLibrary}</Link>{' · '}<Link className="text-link" to={libraryPath + '&near=1'} state={returnToBook}>Libraries near me</Link></>
      : needsIsbn ? <Link className="text-link" to="/app/search">Scan ISBN</Link>
      : needsTitle ? <Link className="text-link" to="/app/search">{catalogMessages.searchLibrary}</Link>
      : catalogUrl ? <a className="text-link" href={catalogUrl} target="_blank" rel="noopener noreferrer">{catalogMessages.catalogAction}<span aria-hidden="true"> ↗</span></a>
      : <Link className="text-link" to={libraryPath} state={returnToBook}>Change library</Link>}
  </aside>;
}
