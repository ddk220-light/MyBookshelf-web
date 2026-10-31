import { useCallback, useEffect, useRef, useState } from 'react';
import { publicApi } from '../../api';
import { messageFor } from '../../context';
import type { LibraryAreas, LibraryDiscovery, Place, PublicLibraryPage } from '../../types';

type DiscoveryState = { query: string; center: Place | null; radius: number; areaOpen: boolean; country: string; region: string; district: string; page: PublicLibraryPage | null; filters: LibraryDiscovery };
const empty: DiscoveryState = { query: '', center: null, radius: 25, areaOpen: false, country: '', region: '', district: '', page: null, filters: {} };
// Coordinates live only for this open tab. No URLs, persistent storage, analytics, or external reverse geocoder.
let memory: DiscoveryState | null = null;
export function resetLibrarySearchSession() { memory = null; }
const atPlace = (place: Place, radius: number): LibraryDiscovery => place.id.startsWith('geonames:') ? { placeId: place.id, radiusKm: radius } : { lat: place.lat, lon: place.lon, radiusKm: radius };

export function useLibraryDiscovery(initial: { country?: string; region?: string; query?: string } = {}) {
  const [search, setSearch] = useState<DiscoveryState>(() => initial.query ? { ...empty, query: initial.query } : initial.region ? { ...empty, areaOpen: true, country: initial.country || '', region: initial.region } : memory || { ...empty });
  const [areas, setAreas] = useState<LibraryAreas>({ countries: [], regions: [], districts: [] });
  const [places, setPlaces] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false), [locating, setLocating] = useState(false), [placeBusy, setPlaceBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [placeError, setPlaceError] = useState<string | null>(null);
  const [areaAttempt, setAreaAttempt] = useState(0);
  const [areaError, setAreaError] = useState(false);
  const request = useRef<AbortController | null>(null), locationAttempt = useRef(0), first = useRef(true);
  const lastRequest = useRef<{ filters: LibraryDiscovery; append: boolean }>({ filters: search.filters, append: false });
  const patch = (value: Partial<DiscoveryState>) => setSearch(current => ({ ...current, ...value }));
  const run = useCallback(async (filters: LibraryDiscovery, append = false) => {
    lastRequest.current = { filters, append };
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(null);
    setSearch(current => ({ ...current, filters, ...(!append ? { page: null } : {}) }));
    try {
      const page = await publicApi.discoverLibraries(filters, controller.signal);
      if (!controller.signal.aborted) setSearch(current => ({ ...current, page: { ...page, libraries: append && current.page ? [...current.page.libraries, ...page.libraries.filter(row => !current.page!.libraries.some(old => old.id === row.id))] : page.libraries } }));
    } catch (failure) { if (!controller.signal.aborted) setError(messageFor(failure, 'Couldn’t load libraries. Try again.')); }
    finally { if (request.current === controller) setBusy(false); }
  }, []);
  useEffect(() => { memory = search; }, [search]);
  useEffect(() => () => { request.current?.abort(); locationAttempt.current++; }, []);
  const { query, center, radius, country, region, district, areaOpen } = search;
  useEffect(() => {
    if (first.current) { first.current = false; if (memory?.page && !initial.region) return; }
    const filters = { ...(query.trim() ? { query: query.trim() } : {}), ...(center ? atPlace(center, radius) : {}), ...(areaOpen ? { country, region, district } : {}) };
    if (!query.trim() && !center && !(areaOpen && (country || region || district))) {
      request.current?.abort(); setBusy(false); patch({ page: null, filters: {} }); return;
    }
    request.current?.abort();
    if (!query.trim() || center) { void run(filters); return; }
    const timer = window.setTimeout(() => { void run(filters); }, 300);
    return () => clearTimeout(timer);
  }, [query, center, radius, country, region, district, areaOpen, run, initial.region]);
  useEffect(() => {
    setPlaces([]); setPlaceError(null);
    if (query.trim().length < 2 || center) { setPlaceBusy(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setPlaceBusy(true);
      publicApi.searchPlaces(query.trim(), controller.signal, areaOpen ? country || undefined : undefined).then(result => { if (!controller.signal.aborted) setPlaces(result); })
        .catch(() => { if (!controller.signal.aborted) setPlaceError('Place search is unavailable. Browse by area.'); })
        .finally(() => { if (!controller.signal.aborted) setPlaceBusy(false); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, center, areaOpen, country]);
  useEffect(() => {
    setAreaError(false);
    const controller = new AbortController();
    publicApi.libraryAreas(country || undefined, region || undefined, controller.signal).then(result => { if (controller.signal.aborted) return; if (!Array.isArray(result?.countries) || !Array.isArray(result?.regions) || !Array.isArray(result?.districts)) throw new Error('Invalid library areas'); setAreas(result); })
      .catch(() => { if (!controller.signal.aborted) setAreaError(true); });
    return () => controller.abort();
  }, [areaOpen, country, region, areaAttempt]);
  const choosePlace = (place: Place) => { locationAttempt.current++; setLocating(false); setPlaces([]); setError(null); patch({ center: place, query: '', country: '', region: '', district: '', areaOpen: false, page: null }); };
  const nearMe = () => {
    const attempt = ++locationAttempt.current;
    setError(null);
    if (!navigator.geolocation) { setError('Location unavailable. Enter a city, town or postcode, or browse by area.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      if (attempt !== locationAttempt.current) return;
      choosePlace({ id: 'near-me', label: 'Your location', lat: position.coords.latitude, lon: position.coords.longitude });
    }, () => { if (attempt === locationAttempt.current) { setLocating(false); setError('Location unavailable. Enter a city, town or postcode, or browse by area.'); } },
    { maximumAge: 60_000, timeout: 12_000, enableHighAccuracy: false });
  };
  const changeQuery = (query: string) => { locationAttempt.current++; setLocating(false); patch({ query, center: null }); };
  const browse = (value: Partial<DiscoveryState> = {}) => { locationAttempt.current++; setLocating(false); patch({ center: null, query: '', areaOpen: true, ...value }); };
  return { search, areas, places, busy, placeBusy, locating, error, placeError, areaError, retryAreas: () => setAreaAttempt(value => value + 1), retry: () => run(lastRequest.current.filters, lastRequest.current.append), patch, run, choosePlace, nearMe, changeQuery, browse };
}
