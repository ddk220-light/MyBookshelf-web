import { useCallback, useEffect, useRef, useState } from 'react';
import { publicApi } from '../../api';
import { messageFor } from '../../context';
import type { LibraryAreas, LibraryDiscovery, Place, PublicLibraryPage } from '../../types';

type DiscoveryState = { query: string; center: Place | null; radius: number; areaOpen: boolean; country: string; region: string; district: string; page: PublicLibraryPage | null; filters: LibraryDiscovery; nearby?: boolean };
const empty: DiscoveryState = { query: '', center: null, radius: 25, areaOpen: false, country: '', region: '', district: '', page: null, filters: {} };
/**
 * compact (the one-shelf library pop-up, plan Phase 7): one list filled either
 * by the typed text or by "near me". No area browse, no place suggestions, and
 * nothing kept beyond the open pop-up: the typed text lives in this hook's
 * state only, and the coordinates are used for one request and not kept.
 */
export type DiscoveryOptions = { compact?: boolean };
// Coordinates live only for this open tab. No URLs, persistent storage, analytics, or external reverse geocoder.
let memory: DiscoveryState | null = null;
export function resetLibrarySearchSession() { memory = null; }
const atPlace = (place: Place, radius: number): LibraryDiscovery => place.id.startsWith('geonames:') ? { placeId: place.id, radiusKm: radius } : { lat: place.lat, lon: place.lon, radiusKm: radius };

export function useLibraryDiscovery(initial: { country?: string; region?: string; query?: string } = {}, { compact = false }: DiscoveryOptions = {}) {
  const [search, setSearch] = useState<DiscoveryState>(() => compact ? { ...empty, query: initial.query || '' } : initial.query ? { ...empty, query: initial.query } : initial.region ? { ...empty, areaOpen: true, country: initial.country || '', region: initial.region } : memory || { ...empty });
  const [areas, setAreas] = useState<LibraryAreas>({ countries: [], regions: [], districts: [] });
  const [places, setPlaces] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false), [locating, setLocating] = useState(false), [placeBusy, setPlaceBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [placeError, setPlaceError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<'load' | 'location' | null>(null);
  const [areaAttempt, setAreaAttempt] = useState(0);
  const [areaError, setAreaError] = useState(false);
  const request = useRef<AbortController | null>(null), locationAttempt = useRef(0), first = useRef(true);
  const lastRequest = useRef<{ filters: LibraryDiscovery; append: boolean }>({ filters: search.filters, append: false });
  const patch = (value: Partial<DiscoveryState>) => setSearch(current => ({ ...current, ...value }));
  const run = useCallback(async (filters: LibraryDiscovery, append = false, transient = false) => {
    // A transient request (near me in the pop-up) is not remembered: its coordinates go out once.
    lastRequest.current = transient ? { filters: {}, append: false } : { filters, append };
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(null); setErrorKind(null);
    setSearch(current => ({ ...current, filters: transient ? {} : filters, ...(!append ? { page: null } : {}) }));
    try {
      const page = await publicApi.discoverLibraries(filters, controller.signal);
      if (!controller.signal.aborted) setSearch(current => ({ ...current, page: { ...page, libraries: append && current.page ? [...current.page.libraries, ...page.libraries.filter(row => !current.page!.libraries.some(old => old.id === row.id))] : page.libraries } }));
    } catch (failure) { if (!controller.signal.aborted) { setError(messageFor(failure, 'Couldn’t load libraries. Try again.')); setErrorKind('load'); } }
    finally { if (request.current === controller) setBusy(false); }
  }, []);
  useEffect(() => { if (!compact) memory = search; }, [search, compact]);
  useEffect(() => () => { request.current?.abort(); locationAttempt.current++; }, []);
  const { query, center, radius, country, region, district, areaOpen, nearby } = search;
  useEffect(() => {
    if (first.current) { first.current = false; if (!compact && memory?.page && !initial.region) return; }
    if (nearby) return;
    const filters = { ...(query.trim() ? { query: query.trim() } : {}), ...(center ? atPlace(center, radius) : {}), ...(areaOpen ? { country, region, district } : {}) };
    if (!query.trim() && !center && !(areaOpen && (country || region || district))) {
      request.current?.abort(); setBusy(false); patch({ page: null, filters: {} }); return;
    }
    request.current?.abort();
    if (!query.trim() || center) { void run(filters); return; }
    const timer = window.setTimeout(() => { void run(filters); }, 300);
    return () => clearTimeout(timer);
  }, [query, center, radius, country, region, district, areaOpen, nearby, run, initial.region, compact]);
  useEffect(() => {
    setPlaces([]); setPlaceError(null);
    if (compact || query.trim().length < 2 || center) { setPlaceBusy(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setPlaceBusy(true);
      publicApi.searchPlaces(query.trim(), controller.signal, areaOpen ? country || undefined : undefined).then(result => { if (!controller.signal.aborted) setPlaces(result); })
        .catch(() => { if (!controller.signal.aborted) setPlaceError('Place search is unavailable. Browse by area.'); })
        .finally(() => { if (!controller.signal.aborted) setPlaceBusy(false); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, center, areaOpen, country, compact]);
  useEffect(() => {
    setAreaError(false);
    if (compact) return;
    const controller = new AbortController();
    publicApi.libraryAreas(country || undefined, region || undefined, controller.signal).then(result => { if (controller.signal.aborted) return; if (!Array.isArray(result?.countries) || !Array.isArray(result?.regions) || !Array.isArray(result?.districts)) throw new Error('Invalid library areas'); setAreas(result); })
      .catch(() => { if (!controller.signal.aborted) setAreaError(true); });
    return () => controller.abort();
  }, [areaOpen, country, region, areaAttempt, compact]);
  const choosePlace = (place: Place) => { locationAttempt.current++; setLocating(false); setPlaces([]); setError(null); patch({ center: place, query: '', country: '', region: '', district: '', areaOpen: false, page: null }); };
  const locationFailed = () => { setError('Location unavailable. Enter a city, town or postcode, or browse by area.'); setErrorKind('location'); };
  const nearMe = () => {
    const attempt = ++locationAttempt.current;
    setError(null); setErrorKind(null);
    if (!navigator.geolocation) { locationFailed(); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      if (attempt !== locationAttempt.current) return;
      if (compact) {
        // The list switches to nearest first; the position is sent once and dropped.
        setLocating(false);
        request.current?.abort();
        patch({ nearby: true, query: '', center: null, page: null });
        void run({ lat: position.coords.latitude, lon: position.coords.longitude, radiusKm: radius }, false, true);
        return;
      }
      choosePlace({ id: 'near-me', label: 'Your location', lat: position.coords.latitude, lon: position.coords.longitude });
    }, () => { if (attempt === locationAttempt.current) { setLocating(false); locationFailed(); } },
    { maximumAge: compact ? 0 : 60_000, timeout: 12_000, enableHighAccuracy: false });
  };
  const changeQuery = (query: string) => { locationAttempt.current++; setLocating(false); setErrorKind(null); patch({ query, center: null, nearby: false }); };
  const browse = (value: Partial<DiscoveryState> = {}) => { locationAttempt.current++; setLocating(false); patch({ center: null, query: '', areaOpen: true, ...value }); };
  return { search, areas, places, busy, placeBusy, locating, error, errorKind, placeError, areaError, retryAreas: () => setAreaAttempt(value => value + 1), retry: () => run(lastRequest.current.filters, lastRequest.current.append), patch, run, choosePlace, nearMe, changeQuery, browse };
}
