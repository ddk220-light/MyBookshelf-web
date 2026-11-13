import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { publicApi, PublicApiError } from '../../api';
import { useLibrary } from '../../context';
import type { PublicLibrary } from '../../types';
import { trapTab } from '../home/dialogFocus';
import { ChevronGlyph, CloseGlyph, LocateGlyph, TickGlyph } from '../home/homeIcons';
import { distanceLabel } from './libraryPresentation';
import { useLibraryDiscovery } from './useLibraryDiscovery';
import '../scan/scan.css';
import './libraryPicker.css';

// The same rules as the server (server/catalog-store/requests.js), so the
// button is offered only for text the server will take.
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const URLISH = /(?:https?:\/\/|www\.)|\b[\p{L}\p{N}-]+\.(?:com|org|net|in|io|co|gov|edu|info|me|app|dev|uk|us|jp)\b/iu;
const CONTROL = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;

/** What the server accepts as a request: 2–80 characters with a letter, no email, link or phone number. */
export function requestableText(value: string): string | null {
  if (CONTROL.test(value.replace(/[\t\n\r]/g, ' '))) return null;
  const text = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (text.length < 2 || text.length > 80 || !/\p{L}/u.test(text)) return null;
  if (/@/.test(text) || EMAIL.test(text) || URLISH.test(text) || (text.match(/\d/g) || []).length >= 7) return null;
  if (text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().length < 2) return null;
  return text;
}

/** "Area · Region" for a row; the directory has no library type. */
export function libraryArea(library: PublicLibrary): string {
  return [...new Set([library.city || library.district, library.region].filter((part): part is string => Boolean(part)))].join(' · ');
}

// 'refused': the server would not take this text (400). Nothing is said and the
// button stays; there is no thank-you for a request that was not received.
type RequestState = 'idle' | 'sending' | 'sent' | 'failed' | 'refused';

/**
 * The library pop-up (LibraryPicker and LibraryStates boards): a bottom sheet
 * where "Libraries near me" and the "City, town or library name" field fill
 * the same list in place. Tapping a row chooses that library and closes the
 * pop-up; the saved shelf is untouched. When nothing matches the typed text,
 * one tap sends it as a request to add a library. The typed text stays in
 * this component's state; the position is used for one request and dropped.
 */
export function LibraryPickerDialog({ open, onClose, onChosen, returnFocus, initialQuery }: {
  open: boolean;
  /** Text to start the field with (an old /app/libraries?q= link); never stored. */
  initialQuery?: string;
  onClose: () => void;
  /** Called after a library is chosen (the pop-up then closes). */
  onChosen?: (library: PublicLibrary) => void;
  returnFocus?: () => HTMLElement | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const listId = useId();
  const [session, setSession] = useState(0);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>(initialQuery ? '#library-place' : '.library-near')?.focus();
    }
    if (!open && dialog.open) {
      dialog.close();
      returnFocus?.()?.focus();
    }
    // Each opening starts empty: nothing typed or located is carried over.
    if (!open) setSession(value => value + 1);
  }, [open, returnFocus]);

  const keyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); onClose(); return; }
    trapTab(event, ref.current);
  };
  const backdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target !== ref.current) return;
    const box = ref.current.getBoundingClientRect();
    if (event.clientX > box.right || event.clientX < box.left || event.clientY < box.top || event.clientY > box.bottom) onClose();
  };

  return <dialog ref={ref} className="scan-dialog library-dialog" aria-labelledby={titleId} onKeyDown={keyDown} onClick={backdrop}
    onCancel={event => { event.preventDefault(); onClose(); }} onClose={() => { if (open) onClose(); }}>
    {open && <PickerBody key={session} titleId={titleId} listId={listId} onClose={onClose} onChosen={onChosen} initialQuery={initialQuery} />}
  </dialog>;
}

function PickerBody({ titleId, listId, onClose, onChosen, initialQuery }: { titleId: string; listId: string; onClose: () => void; onChosen?: (library: PublicLibrary) => void; initialQuery?: string }) {
  const { selectLibrary, library: selected, recoveryMode } = useLibrary();
  const [startQuery] = useState(initialQuery);
  const model = useLibraryDiscovery({ query: startQuery }, { compact: true });
  const { search, busy, locating, errorKind, nearMe, changeQuery } = model;
  const { query, page, nearby } = search;
  const [request, setRequest] = useState<RequestState>('idle');
  const [asking, setAsking] = useState(false);
  const [choosing, setChoosing] = useState<string | null>(null);
  const typed = query.trim();
  const requestText = requestableText(query);
  const libraries = page?.libraries || [];
  const showList = Boolean(typed || nearby);
  const nothing = showList && Boolean(page) && !busy && libraries.length === 0;
  const usMiles = libraries.find(item => item.distanceKm != null)?.country === 'US';

  const type = (value: string) => { setRequest('idle'); setAsking(false); changeQuery(value); };
  const choose = async (library: PublicLibrary) => {
    if (choosing || recoveryMode) return;
    setChoosing(library.id);
    const ok = await selectLibrary(library).catch(() => false);
    setChoosing(null);
    if (!ok) return;
    onChosen?.(library);
    onClose();
  };
  const sendRequest = async () => {
    if (!requestText || request === 'sending' || request === 'sent') return;
    setRequest('sending');
    try { await publicApi.libraryRequest(requestText); setRequest('sent'); }
    catch (failure) { setRequest(failure instanceof PublicApiError && failure.status === 400 ? 'refused' : 'failed'); }
  };
  const retry = () => { if (nearby) nearMe(); else void model.retry(); };

  // "Nearest first" only when the server gave distances; without them the order is not known to be by distance.
  const hasDistances = libraries.some(item => item.distanceKm != null);
  const label = nearby ? (hasDistances ? 'Nearest first' : 'Libraries near you') : page?.area ? 'Libraries in ' + page.area.label.split(',')[0] : 'Libraries';
  const status = request === 'sent' ? 'Received your request, thank you.' : request === 'failed' ? 'Couldn’t send. Try again.' : locating ?'Finding libraries near you' : busy ? 'Finding libraries' : errorKind === 'location' ? 'Location unavailable'
    : errorKind === 'load' ? 'Couldn’t load libraries' : nothing ? 'No libraries here yet'
      : page && showList ? (libraries.length === 1 ? '1 library' : libraries.length + ' libraries') : '';

  return <>
    <span className="scan-handle" aria-hidden="true" />
    <div className="scan-header">
      <h2 id={titleId}>Find your library</h2>
      <button type="button" className="scan-close" aria-label="Close" onClick={onClose}><CloseGlyph /></button>
    </div>

    <button type="button" className={'home-button home-button-outline library-near' + (nearby ? ' is-on' : '')} aria-pressed={nearby || false} aria-busy={locating || undefined}
      disabled={locating} onClick={() => { setRequest('idle'); setAsking(false); nearMe(); }}>
      <LocateGlyph />Libraries near me
    </button>
    <p className="scan-or library-or" aria-hidden="true"><span>or</span></p>
    <div className="library-field">
      <label htmlFor="library-place">City, town or library name</label>
      <input id="library-place" type="search" enterKeyHint="search" autoComplete="off" spellCheck={false} maxLength={120}
        className={nearby ? '' : typed ? 'is-active' : ''} value={query} onChange={event => type(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} aria-controls={showList ? listId : undefined} />
    </div>

    <p className="visually-hidden" role="status">{status}</p>
    {errorKind === 'location' && <p className="library-line">Location unavailable</p>}
    {errorKind === 'load' && <div className="library-line library-line-action"><span>Couldn’t load libraries</span>
      <button type="button" className="home-text-button" onClick={retry}>Try again</button></div>}

    {showList && !errorKind && <div className="library-list" id={listId} role="region" aria-label={label} aria-busy={busy || undefined}>
      {libraries.length > 0 && (nearby || page?.area) && <p className="library-list-label" aria-hidden="true">{label}</p>}
      {busy && !libraries.length && <div className="library-rows" aria-hidden="true">{[0, 1, 2].map(row => <span key={row} className="library-row library-row-ghost"><span /><span /></span>)}</div>}
      {libraries.length > 0 && <ul className="library-rows">{libraries.map(item => {
        const area = libraryArea(item);
        const mine = selected?.id === item.id;
        return <li key={item.id}>
          <button type="button" className="library-row" aria-current={mine || undefined} disabled={recoveryMode || Boolean(choosing)} onClick={() => { void choose(item); }}>
            <span className="library-row-text"><span className="library-row-name">{item.name}</span>{area && <span className="library-row-area">{area}</span>}</span>
            {item.distanceKm != null && <span className="library-row-distance">{distanceLabel(item.distanceKm, usMiles ? 'US' : item.country, item.distanceApproximate)}</span>}
            {mine ? <TickGlyph size={20} /> : <ChevronGlyph />}
          </button>
        </li>;
      })}</ul>}
      {nothing && <p className="library-line">No libraries here yet</p>}
    </div>}

    {requestText && !errorKind && (nothing || (asking && libraries.length > 0)) && (request === 'sent'
      ? <p className="library-requested"><TickGlyph size={20} />Received your request, thank you.</p>
      : <>
        <button type="button" className="home-button library-request" disabled={request === 'sending'} aria-busy={request === 'sending' || undefined} onClick={() => { void sendRequest(); }}>
          Request to add “{requestText}”
        </button>
        {request === 'failed' && <p className="library-line">Couldn’t send. Try again.</p>}
      </>)}
    {requestText && !errorKind && !nothing && !asking && libraries.length > 0 && !busy
      && <button type="button" className="home-text-button library-unlisted" onClick={() => setAsking(true)}>My library isn’t listed</button>}
  </>;
}
