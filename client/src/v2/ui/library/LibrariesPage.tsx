import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { publicApi } from '../../api';
import { useLibrary } from '../../context';
import type { PublicBook, PublicLibrary } from '../../types';
import type { LibraryNavigation } from '../../bookNavigation';
import { useMobileLayout } from '../../useMediaQuery';
import { Notice } from '../Notice';
import { CopyLibraryLink } from './CopyLibraryLink';
import { distanceLabel } from './libraryPresentation';
import { LibraryDetail } from './LibraryDetail';
import { useLibraryDiscovery } from './useLibraryDiscovery';
import { countOf, formatCount } from '../../format';
export { resetLibrarySearchSession } from './useLibraryDiscovery';

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
export function LibrariesPage() {
  const { selectLibrary, library: selected, recoveryMode } = useLibrary();
  const navigate = useNavigate(), location = useLocation();
  const [params, setParams] = useSearchParams();
  const [pastedLink, setPastedLink] = useState('');
  const [linkError, setLinkError] = useState('');
  const mobile = useMobileLayout();
  const initial = useRef({ country: params.get('country') || '', region: params.get('region') || '', query: params.get('q') || '' });
  const model = useLibraryDiscovery(initial.current);
  const { search, areas, places, busy, placeBusy, locating, error, placeError, areaError, retryAreas, patch, run, choosePlace, nearMe, changeQuery, browse } = model;
  const { query, center, radius, country, region, district, areaOpen, page, filters } = search;
  const autoNear = useRef(false);
  useEffect(() => { if (params.get('near') === '1' && !autoNear.current) { autoNear.current = true; nearMe(); } }, [params, nearMe]);
  const routeState = location.state as LibraryNavigation | null;
  const bookKey = params.get('book');
  const [book, setBook] = useState<PublicBook | null>(routeState?.book || null);
  useEffect(() => {
    if (!bookKey || book?.bookKey === bookKey) return;
    let active = true;
    publicApi.resolveBook(bookKey).then(result => { if (active) setBook(result); }).catch(() => {});
    return () => { active = false; };
  }, [bookKey, book?.bookKey]);
  const bookPath = bookKey ? '/app/books/' + encodeURIComponent(bookKey) : null;
  const bookReturn = bookPath && (routeState?.after === bookPath || routeState?.after?.startsWith(bookPath + '?')) ? routeState.after : bookPath;
  const detailId = params.get('library');
  const usDistances = (center?.country || page?.area?.country || country || page?.libraries.find(item => item.distanceKm != null)?.country) === 'US';
  const [resolved, setResolved] = useState<PublicLibrary | null>(null), [detailError, setDetailError] = useState(false), [detailAttempt, setDetailAttempt] = useState(0);
  const detail = detailId ? page?.libraries.find(row => row.id === detailId) || (selected?.id === detailId ? selected : resolved?.id === detailId ? resolved : null) : selected;
  useEffect(() => {
    if (!detailId || detail?.id === detailId) return;
    let active = true; setDetailError(false); setResolved(null);
    publicApi.resolveLibrary(detailId).then(value => { if (active) setResolved(value); }).catch(() => { if (active) setDetailError(true); });
    return () => { active = false; };
  }, [detailId, detail?.id, detailAttempt]);
  const openDetail = (library: PublicLibrary) => {
    setResolved(library); const next = new URLSearchParams(params); next.set('library', library.id);
    setParams(next, { state: location.state });
  };
  const closeDetail = () => { const next = new URLSearchParams(params); next.delete('library'); setParams(next, { replace: true, state: location.state }); };
  const choose = async(library: PublicLibrary) => {
    if (recoveryMode) return;
    if(await selectLibrary(library)===false)return;
    const after = routeState?.after;
    navigate(bookReturn || (after === '/app/search' || after === '/app/shelf' || after === '/app/settings' || after?.startsWith('/app/books/') ? after : '/app/search'),
      bookReturn ? { state: { ...routeState?.bookNavigation, ...(book ? { book } : {}) } } : undefined);
  };
  const onResultKey = (event: KeyboardEvent<HTMLUListElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !(event.target instanceof HTMLButtonElement) || !event.target.classList.contains('library-row-open')) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.library-row-open')];
    const current = buttons.indexOf(event.target);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
    event.preventDefault(); buttons[next]?.focus();
  };
  const results = <div className="library-list-panel">
    {places.length > 0 && <section className="place-options"><h2>Places</h2><ul>{places.map(place => <li key={place.id}><button className="place-result" onClick={() => choosePlace(place)}>{place.label}<span aria-hidden="true">→</span></button></li>)}</ul></section>}
    {placeBusy && <p className="muted" role="status">Finding places…</p>}
    {placeError && !page?.libraries.length && !busy && <p className="muted">{placeError}</p>}
    {selected && !center && !query && <section className="selected-library-row"><h2>Your library</h2><div><button className="library-row-open" onClick={() => openDetail(selected)}><strong>{selected.name}</strong><small>{selected.city}</small></button><CopyLibraryLink library={selected} bookReturn={bookReturn} /></div></section>}
    {!query && !center && <section className="country-start"><button className="button-quiet" aria-expanded={areaOpen} onClick={() => areaOpen ? patch({ areaOpen: false }) : browse()}>Browse by country</button>
      {!areaOpen && <div className="country-options">{areas.countries.map(code => <button className="country-option" key={code} onClick={() => browse({ country: code, region: '', district: '' })}><span>{countryNames.of(code) || code}</span>{areas.counts?.countries[code] != null && <small>{countOf(areas.counts.countries[code], 'library', 'libraries')}</small>}<span aria-hidden="true">→</span></button>)}</div>}
      {areaError && <p role="status">Couldn’t load countries. <button className="text-button" onClick={retryAreas}>Retry</button></p>}
    </section>}
    {!query && !center && <details className="paste-library-link"><summary>Paste a library link</summary><form onSubmit={event => {
        event.preventDefault();
        try { const url = new URL(pastedLink, window.location.origin); if (url.origin !== window.location.origin || !/^\/select\/[^/]+$/.test(url.pathname)) throw Error(); navigate(url.pathname + url.search); }
        catch { setLinkError('Paste a MyBookshelf library selection link.'); }
      }}><label>Library link<input type="url" value={pastedLink} onChange={event => setPastedLink(event.target.value)} /></label><button>Open library</button>{linkError && <p role="alert">{linkError}</p>}</form></details>}
    <div className="section-heading" hidden={!page && !busy}><h2>{page?.area ? 'In ' + page.area.label.split(',')[0] : 'Results'}</h2>{page && <span className="muted" role="status">{formatCount(page.libraries.length)} of {countOf(page.total, 'library', 'libraries')}</span>}</div>
    {busy && !page && <div className="library-skeletons" role="status"><span className="visually-hidden">Finding libraries…</span>{[0,1,2].map(i => <div className="skeleton" key={i} />)}</div>}

    {page && !page.total && !busy && <div className="discovery-empty"><h3>No libraries found here</h3><p>Try a nearby town or browse by area.</p><button className="button-quiet" onClick={() => browse({ country: page.area?.country || country, region: page.area?.region || region })}>Browse this area</button></div>}
    {page && page.libraries.length > 0 && <ul className="library-results-list" aria-label="Library search results" onKeyDown={onResultKey}>{page.libraries.map(item => <li key={item.id} data-selected={detail?.id === item.id}>
      <button className="library-row-open" aria-pressed={detail?.id === item.id} onClick={() => openDetail(item)}><strong>{item.name}</strong>
        <small>{item.distanceKm != null ? distanceLabel(item.distanceKm, usDistances ? 'US' : item.country, item.distanceApproximate) : item.locationMatch?.label || [item.city, item.region].filter(Boolean).join(' · ')}{item.capabilities.publicAvailability ? ' · checks availability' : ' · library website'}</small>
        {item.branchClassification === 'complete' && item.branchCount != null && item.branchCount > 1 && <small>{item.branchCount} branches</small>}</button>
      <button className="library-choose" aria-label={'Select ' + item.name} disabled={recoveryMode} onClick={() => choose(item)}>{selected?.id === item.id ? '✓ Yours' : 'Choose'}</button>
    </li>)}</ul>}
    {page?.nextOffset != null && <button className="button-quiet more-libraries" disabled={busy} onClick={() => void run({ ...filters, offset: page.nextOffset! }, true)}>{busy ? 'Loading…' : 'Show more libraries'}</button>}
    {(page?.attribution || places.some(place => place.attribution)) && <p className="place-attribution">Place data: <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a> · CC BY 4.0</p>}
    {places.length > 0 && places.some(place => !place.attribution) && <p className="place-attribution">Places: <a href="https://photon.komoot.io/" target="_blank" rel="noopener noreferrer">Photon</a> · OpenStreetMap</p>}
  </div>;
  const details = detail ? <LibraryDetail key={detail.id} library={detail} selected={selected?.id === detail.id} currentName={selected?.name} onChange={() => { closeDetail(); document.getElementById('library-search')?.focus(); }} disabled={recoveryMode} onChoose={() => choose(detail)} bookReturn={bookReturn} />
    : detailId ? <div>{detailError ? <><Notice tone="error">Couldn’t load this library.</Notice><button onClick={() => setDetailAttempt(value => value + 1)}>Retry</button></> : <p role="status">Loading library…</p>}</div>
      : <div className="library-detail-placeholder"><h2>Choose a library</h2><p>Open a library to see its catalog and locations.</p><button className="button-quiet" onClick={() => browse()}>Browse by area</button></div>;
  return <section className="page-section reader-libraries">
    {bookKey && <div className="book-return-bar"><span>Choosing a library{book && <> for <strong>{book.title}</strong></>}</span><Link className="back-link" to={bookReturn!} state={routeState?.bookNavigation}>← Back to book</Link></div>}
    {mobile && detailId ? <><button className="text-button" onClick={closeDetail}>← Libraries</button>{details}</> : <>
      <header className="page-heading"><h1>Libraries</h1></header>
      <form className="library-unified-search" onSubmit={event => { event.preventDefault(); if (query.trim()) void run({ query: query.trim(), ...(areaOpen ? { country, region, district } : {}) }); }}>
        <label className="visually-hidden" htmlFor="library-search">Library, city or postcode</label><div className="search-input-shell"><input id="library-search" type="search" enterKeyHint="search" value={query} maxLength={120} placeholder="Library, city or postcode" autoComplete="off" onChange={event => changeQuery(event.target.value)} />
          {query && <button type="button" className="icon-button" aria-label="Clear library search" onClick={() => changeQuery('')}>×</button>}</div>
        <button className="button-quiet" type="submit">Search</button>
      </form>
      <div className="discovery-chips"><button className="button-quiet" onClick={nearMe} disabled={locating} aria-pressed={Boolean(center)}>{locating ? 'Locating…' : 'Libraries near me'}</button>{(query || center) && <button className="button-quiet" aria-expanded={areaOpen} onClick={() => browse()}>Browse by country</button>}</div>
      {areaOpen && <div className="library-area">
        <label>Country<select value={country} onChange={event => browse({ country: event.target.value, region: '', district: '' })}><option value="">All countries</option>{[...new Set([country, ...areas.countries])].filter(Boolean).map(code => <option value={code} key={code}>{countryNames.of(code) || code}{areas.counts?.countries[code] != null ? ' (' + formatCount(areas.counts.countries[code]) + ')' : ''}</option>)}</select></label>
        <label>State or region<select value={region} onChange={event => browse({ region: event.target.value, district: '' })}><option value="">All states / regions</option>{[...new Set([region, ...areas.regions])].filter(Boolean).map(name => <option value={name} key={name}>{name}{areas.counts?.regions[name] != null ? ' (' + formatCount(areas.counts.regions[name]) + ')' : ''}</option>)}</select></label>
        <label>District<select value={district} onChange={event => browse({ district: event.target.value })} disabled={!region}><option value="">All districts</option>{areas.districts.map(name => <option value={name} key={name}>{name}{areas.counts?.districts[name] != null ? ' (' + formatCount(areas.counts.districts[name]) + ')' : ''}</option>)}</select></label>
      </div>}
      {center && <div className="location-context"><span>{page?.area ? 'In ' + page.area.label : 'Nearest to you'}{page?.area?.expanded && ' · expanded to ' + distanceLabel(page.radiusKm || radius, usDistances ? 'US' : country)}</span>
        <label>Search area<select aria-label="Search distance" value={page?.radiusKm || radius} onChange={event => patch({ radius: Number(event.target.value) })}>{[...new Set([page?.radiusKm || radius, ...(usDistances ? [24.14016,48.28032,80.4672] : [25,50,100])])].sort((a,b) => a-b).map(value => <option value={value} key={value}>Within {distanceLabel(value, usDistances ? 'US' : country)}</option>)}</select></label>
        <button className="text-button" onClick={() => { patch({ center: null }); document.getElementById('library-search')?.focus(); }}>Change area</button>
      </div>}
      {error && <Notice tone="error">{error} {!/Location unavailable/.test(error) && <button onClick={() => void model.retry()}>Retry</button>}</Notice>}
      {areaOpen && areaError && <Notice tone="error">Couldn’t load areas. <button onClick={retryAreas}>Retry</button></Notice>}
      <div className="library-panes">{results}{!mobile && <aside className="library-detail-pane">{details}</aside>}</div>
    </>}
  </section>;
}
