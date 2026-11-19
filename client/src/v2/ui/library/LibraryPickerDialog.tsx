import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type RefObject } from 'react';
import { useLibrary } from '../../context';
import type { PublicLibrary, PublicLibraryPage } from '../../types';
import { useLayoutMode } from '../desk/layoutMode';
import { trapTab } from '../home/dialogFocus';
import { BackGlyph, ChevronGlyph, CloseGlyph, LocateGlyph, TickGlyph } from '../home/homeIcons';
import { distanceLabel } from './libraryPresentation';
import { RequestLibraryForm } from './RequestLibraryForm';
import { requestableText } from './requestableText';
import { useLibraryDiscovery } from './useLibraryDiscovery';
import '../contact/contact.css';
import '../scan/scan.css';
import './libraryPicker.css';

export { requestableText } from './requestableText';

/** "Area · Region" for a row; the directory has no library type. */
export function libraryArea(library: PublicLibrary): string {
  return [...new Set([library.city || library.district, library.region].filter((part): part is string => Boolean(part)))].join(' · ');
}

/** The selector for the picker's text field (a neutral id, see LibraryPicker). */
export const LIBRARY_FIELD = '.library-query';

/**
 * The visible count over the list (PickerTyping and PickerResults boards):
 * how many are shown of how many there are, and where.
 */
export function libraryCount(page: PublicLibraryPage, nearby: boolean): string {
  const shown = page.libraries.length, total = Math.max(page.total || 0, shown);
  if (!shown) return '';
  const some = (count: number) => (count === 1 ? '1 library' : count + ' libraries');
  if (nearby) return shown < total ? `Showing the ${shown} nearest of ${total} libraries near you.` : some(total) + ' near you';
  if (page.area) {
    const place = page.area.label.split(',')[0];
    return shown < total ? `Showing ${shown} of ${total} libraries in ${place}. Type a library’s name to narrow the list.` : `${some(total)} in ${place}`;
  }
  return shown < total ? `Showing ${shown} of ${total} libraries that match` : total === 1 ? '1 library matches' : total + ' libraries match';
}

/**
 * Keeps the bottom sheet inside the part of the screen above the on-screen
 * keyboard (PickerTyping board). A phone's keyboard shrinks the visual
 * viewport but not the layout viewport the sheet is placed in, so the sheet's
 * height and lift are set as CSS variables from `visualViewport` while it is
 * open. The listeners follow the reader's own resizing and scrolling (the
 * keyboard opening, closing or moving), are added when the sheet opens and
 * removed when it closes. Chrome on Android also resizes the layout itself
 * (interactive-widget=resizes-content in index.html), and the lift is then 0.
 */
function useSheetAboveKeyboard(open: boolean, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const sheet = ref.current, viewport = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!open || !sheet || !viewport) return;
    const fit = () => {
      // Pinch zoom also shrinks the visual viewport: leave the sheet as it is then.
      if (viewport.scale > 1.01) { sheet.style.removeProperty('--sheet-height'); sheet.style.removeProperty('--sheet-lift'); return; }
      const layoutHeight = document.documentElement.clientHeight || window.innerHeight;
      sheet.style.setProperty('--sheet-height', Math.round(viewport.height) + 'px');
      sheet.style.setProperty('--sheet-lift', Math.max(0, Math.round(layoutHeight - viewport.height - viewport.offsetTop)) + 'px');
    };
    fit();
    viewport.addEventListener('resize', fit);
    viewport.addEventListener('scroll', fit);
    return () => {
      viewport.removeEventListener('resize', fit);
      viewport.removeEventListener('scroll', fit);
      sheet.style.removeProperty('--sheet-height');
      sheet.style.removeProperty('--sheet-lift');
    };
  }, [open, ref]);
}

/**
 * A touch screen (a tablet at rail or wide width): focusing the field there
 * opens the on-screen keyboard over the picker, so focus waits for a tap.
 */
export function touchScreen(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

/**
 * The library pop-up (PickerTyping, PickerResults and RequestLibrary boards):
 * a bottom sheet on phones, beside the rail at middle widths. The title and
 * Close and the field stay in place; only the list scrolls. On phones and
 * other touch screens the keyboard does not open until the reader taps the
 * field (focus starts on "Libraries near me"); at rail width with a mouse or
 * keyboard focus starts in the field. Tapping a
 * row chooses that library and closes the pop-up; the saved shelf is
 * untouched. The typed text stays in this component's state; the position is
 * used for one request and dropped.
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
  const phone = useLayoutMode() === 'phone';
  useSheetAboveKeyboard(open, ref);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>(phone || touchScreen() ? '.library-near' : LIBRARY_FIELD)?.focus();
    }
    if (!open && dialog.open) {
      dialog.close();
      returnFocus?.()?.focus();
    }
    // Each opening starts empty: nothing typed or located is carried over.
    if (!open) setSession(value => value + 1);
    // Focus moves in once, when the pop-up opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    {open && <LibraryPicker key={session} titleId={titleId} listId={listId} onClose={onClose} onChosen={onChosen} initialQuery={initialQuery} />}
  </dialog>;
}

/**
 * The picker itself: the reader's library with Remove, the field, "Libraries
 * near me", the count, the list, "Show 25 more" and "My library isn't
 * listed", which opens the request form in place of the list. The pop-up
 * holds it as a bottom sheet (`sheet`); at wide widths the left column holds
 * it in place of the library section (`column`: no handle).
 */
export function LibraryPicker({ titleId, listId, onClose, onChosen, initialQuery, variant = 'sheet' }: { titleId: string; listId: string; onClose: () => void; onChosen?: (library: PublicLibrary) => void; initialQuery?: string; variant?: 'sheet' | 'column' }) {
  const { selectLibrary, clearLibrary, library: selected, recoveryMode } = useLibrary();
  const [startQuery] = useState(initialQuery);
  const model = useLibraryDiscovery({ query: startQuery });
  const { search, busy, locating, errorKind, nearMe, changeQuery, canLoadMore, loadMore, loadingMore, moreFailed } = model;
  const { query, page, nearby } = search;
  // The request form, with the text it starts from; null shows the list.
  const [requesting, setRequesting] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removed, setRemoved] = useState(false);
  // While the reader types on a phone (the field has focus or text), the
  // handle, "Libraries near me" and "Your library now" step aside so the list
  // has room above the keyboard (PickerTyping board).
  const [fieldFocused, setFieldFocused] = useState(false);
  const phone = useLayoutMode() === 'phone';
  const root = useRef<HTMLDivElement>(null);
  const focusNext = useRef<(() => HTMLElement | null | undefined) | null>(null);
  const firstNewRow = useRef<number | null>(null);
  const captionId = useId();
  const typed = query.trim();
  const requestText = requestableText(query);
  const libraries = page?.libraries || [];
  const showList = Boolean(typed || nearby);
  const nothing = showList && Boolean(page) && !busy && libraries.length === 0;
  const usMiles = libraries.find(item => item.distanceKm != null)?.country === 'US';
  const remaining = page ? Math.max(0, page.total - libraries.length) : 0;
  // A refused or failed position leaves the typed list as it was.
  const listFailed = errorKind === 'load';

  // Focus that must wait for the next render (the form opening or closing, new rows).
  useLayoutEffect(() => {
    const target = focusNext.current;
    if (target) { focusNext.current = null; target()?.focus(); }
  });
  useEffect(() => {
    if (firstNewRow.current == null || libraries.length <= firstNewRow.current) return;
    root.current?.querySelectorAll<HTMLElement>('.library-row:not(.library-row-ghost)')[firstNewRow.current]?.focus();
    firstNewRow.current = null;
  }, [libraries.length]);

  const field = () => root.current?.querySelector<HTMLInputElement>(LIBRARY_FIELD) || null;
  const title = () => document.getElementById(titleId);
  const type = (value: string) => { setRemoved(false); changeQuery(value); };
  const choose = async (library: PublicLibrary) => {
    if (choosing || recoveryMode) return;
    setChoosing(library.id);
    const ok = await selectLibrary(library).catch(() => false);
    setChoosing(null);
    if (!ok) return;
    onChosen?.(library);
    onClose();
  };
  const remove = async () => {
    if (removing || recoveryMode) return;
    setRemoving(true);
    const ok = await clearLibrary().catch(() => false);
    setRemoving(false);
    if (!ok) return;
    setRemoved(true);
    // The card and its button are gone: the title says where the reader is now.
    focusNext.current = title;
  };
  const more = () => { firstNewRow.current = libraries.length; void loadMore(); };
  const openRequest = (text: string) => { setRequesting(text); focusNext.current = title; };
  const closeRequest = () => { setRequesting(null); focusNext.current = () => root.current?.querySelector<HTMLElement>('.library-unlisted, .library-request'); };
  const retry = () => { if (nearby) nearMe(); else void model.retry(); };

  const sheet = variant === 'sheet';
  const back = <button type="button" className="page-back library-back" onClick={closeRequest}><BackGlyph />Back to the list</button>;
  if (requesting !== null) return <div ref={root} className="library-picker library-picker-request">
    {sheet && <span className="scan-handle" aria-hidden="true" />}
    {back}
    <div className="scan-header">
      <h2 id={titleId} tabIndex={-1}>Ask us to add a library</h2>
      <button type="button" className="scan-close" aria-label="Close" onClick={onClose}><CloseGlyph /></button>
    </div>
    <RequestLibraryForm initialText={requesting} onCancel={closeRequest} onDone={onClose} />
  </div>;

  // "Nearest first" only when the server gave distances; without them the order is not known to be by distance.
  const hasDistances = libraries.some(item => item.distanceKm != null);
  const label = nearby ? (hasDistances ? 'Nearest first' : 'Libraries near you') : page?.area ? 'Libraries in ' + page.area.label.split(',')[0] : 'Libraries';
  const count = page && showList && !busy && !listFailed ? libraryCount(page, nearby) : '';
  const status = removed ? 'Library removed. You can choose another one.' : locating ? 'Finding libraries near you' : busy ? 'Finding libraries'
    : errorKind === 'location' ? 'Location unavailable. Type your city or library name instead.'
      : errorKind === 'load' ? 'Couldn’t load libraries' : nothing ? 'No libraries here yet' : loadingMore ? 'Loading more libraries' : count;
  const place = selected ? [selected.name, selected.city && !selected.name.includes(selected.city) ? selected.city : null].filter(Boolean).join(', ') : '';

  const typing = sheet && phone && !nearby && (fieldFocused || Boolean(query));
  return <div ref={root} className={'library-picker' + (typing ? ' is-typing' : '')}>
    {sheet && <span className="scan-handle" aria-hidden="true" />}
    <div className="scan-header">
      <h2 id={titleId} tabIndex={-1}>{selected ? 'Change library' : 'Find your library'}</h2>
      <button type="button" className="scan-close" aria-label="Close" onClick={onClose}><CloseGlyph /></button>
    </div>

    {selected && <div className="library-current">
      <p className="library-current-text"><span className="library-current-label">Your library now</span><span className="library-current-name" id={captionId + '-current'}>{place}</span></p>
      <button type="button" className="home-text-button library-remove" aria-describedby={captionId + '-current'} disabled={removing || recoveryMode} onClick={() => { void remove(); }}>Remove</button>
    </div>}

    <div className="library-field">
      {/* A caption, not a <label>, and a neutral id and name: Safari offers
          "AutoFill Contact" for a field it takes to be a city or a name. */}
      <span className="library-field-caption" id={captionId}>City, town or library name</span>
      <div className={'library-field-box' + (nearby ? '' : typed ? ' is-active' : '')}>
        <input id="library-lookup" name="library-lookup" className="library-query" type="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} maxLength={120}
          aria-labelledby={captionId} value={query} onChange={event => type(event.target.value)}
          onFocus={() => setFieldFocused(true)} onBlur={() => setFieldFocused(false)}
          onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} aria-controls={showList ? listId : undefined} />
        {query && <button type="button" className="library-clear" aria-label="Clear" onClick={() => { type(''); field()?.focus(); }}><CloseGlyph size={20} /></button>}
      </div>
    </div>

    <button type="button" className={'home-button home-button-outline library-near' + (nearby ? ' is-on' : '')} aria-pressed={nearby || false} aria-busy={locating || undefined}
      disabled={locating} onClick={() => { setRemoved(false); nearMe(); }}>
      <LocateGlyph />Libraries near me
    </button>

    <p className="visually-hidden" role="status">{status}</p>
    {count && <p className="library-count" aria-hidden="true">{count}</p>}
    {errorKind === 'location' && <p className="library-line library-line-location">Location unavailable.{' '}
      <button type="button" className="home-text-button library-type-instead" onClick={() => field()?.focus()}>Type your city or library name instead</button></p>}
    {errorKind === 'load' && <div className="library-line library-line-action"><span>Couldn’t load libraries</span>
      <button type="button" className="home-text-button" onClick={retry}>Try again</button></div>}

    {showList && !listFailed && <div className="library-list" id={listId} role="region" aria-label={label} aria-busy={busy || undefined}>
      {libraries.length > 0 && (nearby || page?.area) && <p className="library-list-label" aria-hidden="true">{label}</p>}
      {busy && !libraries.length && <div className="library-rows" aria-hidden="true">{[0, 1, 2].map(row => <span key={row} className="library-row library-row-ghost"><span /><span /></span>)}</div>}
      {libraries.length > 0 && <ul className="library-rows">{libraries.map(item => {
        const area = libraryArea(item);
        const mine = selected?.id === item.id;
        return <li key={item.id}>
          <button type="button" className="library-row" aria-current={mine || undefined} disabled={recoveryMode || Boolean(choosing)} onClick={() => { void choose(item); }}>
            <span className="library-row-text"><span className="library-row-name">{item.name}</span>
              {mine ? <span className="library-row-mine">Your library</span> : area && <span className="library-row-area">{area}</span>}</span>
            {item.distanceKm != null && <span className="library-row-distance">{distanceLabel(item.distanceKm, usMiles ? 'US' : item.country, item.distanceApproximate)}</span>}
            {mine ? <TickGlyph size={20} /> : <ChevronGlyph />}
          </button>
        </li>;
      })}</ul>}
      {nothing && <p className="library-line">No libraries here yet</p>}
    </div>}

    {nothing && requestText && !listFailed
      ? <div className="library-footer">
        <button type="button" className="home-button library-request" onClick={() => openRequest(requestText)}>Request to add “{requestText}”</button>
      </div>
      : !busy && !locating && <div className="library-footer">
        {canLoadMore && remaining > 0 && !listFailed && <button type="button" className="home-button home-button-outline library-more" disabled={loadingMore} aria-busy={loadingMore || undefined} onClick={more}>
          {loadingMore ? 'Loading…' : `Show ${Math.min(25, remaining)} more`}</button>}
        {moreFailed && <p className="library-line" role="alert">Couldn’t load more. Try again.</p>}
        <button type="button" className="home-text-button library-unlisted" onClick={() => openRequest(requestText || (nearby ? '' : typed.slice(0, 80)))}>My library isn’t listed</button>
      </div>}
  </div>;
}
