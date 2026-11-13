import { useCallback, useEffect, useRef, useState } from 'react';
import { publicApi } from '../../api';
import { messageFor } from '../../context';
import type { LibraryDiscovery, PublicLibraryPage } from '../../types';

type DiscoveryState = { query: string; page: PublicLibraryPage | null; nearby: boolean };
const RADIUS_KM = 25;

/**
 * The library pop-up's list (plan Phase 7): filled either by the typed text or
 * by "near me". Nothing is kept beyond the open pop-up: the typed text lives in
 * this hook's state only, and the coordinates are used for one request and
 * not kept. No URLs, persistent storage, analytics or external geocoder.
 */
export function useLibraryDiscovery(initial: { query?: string } = {}) {
  const [search, setSearch] = useState<DiscoveryState>(() => ({ query: initial.query || '', page: null, nearby: false }));
  const [busy, setBusy] = useState(false), [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<'load' | 'location' | null>(null);
  const request = useRef<AbortController | null>(null), locationAttempt = useRef(0);
  const lastRequest = useRef<LibraryDiscovery>({});
  const patch = (value: Partial<DiscoveryState>) => setSearch(current => ({ ...current, ...value }));
  const run = useCallback(async (filters: LibraryDiscovery, transient = false) => {
    // A transient request (near me) is not remembered: its coordinates go out once.
    lastRequest.current = transient ? {} : filters;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(null); setErrorKind(null);
    setSearch(current => ({ ...current, page: null }));
    try {
      const page = await publicApi.discoverLibraries(filters, controller.signal);
      if (!controller.signal.aborted) setSearch(current => ({ ...current, page }));
    } catch (failure) { if (!controller.signal.aborted) { setError(messageFor(failure, 'Couldn’t load libraries. Try again.')); setErrorKind('load'); } }
    finally { if (request.current === controller) setBusy(false); }
  }, []);
  useEffect(() => () => { request.current?.abort(); locationAttempt.current++; }, []);
  const { query, nearby } = search;
  useEffect(() => {
    if (nearby) return;
    request.current?.abort();
    if (!query.trim()) { setBusy(false); patch({ page: null }); return; }
    const timer = window.setTimeout(() => { void run({ query: query.trim() }); }, 300);
    return () => clearTimeout(timer);
  }, [query, nearby, run]);
  const nearMe = () => {
    const attempt = ++locationAttempt.current;
    setError(null); setErrorKind(null);
    const failed = () => { setError('Location unavailable. Enter a city, town or postcode, or browse by area.'); setErrorKind('location'); };
    if (!navigator.geolocation) { failed(); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      if (attempt !== locationAttempt.current) return;
      // The list switches to nearest first; the position is sent once and dropped.
      setLocating(false);
      request.current?.abort();
      patch({ nearby: true, query: '', page: null });
      void run({ lat: position.coords.latitude, lon: position.coords.longitude, radiusKm: RADIUS_KM }, true);
    }, () => { if (attempt === locationAttempt.current) { setLocating(false); failed(); } },
    { maximumAge: 0, timeout: 12_000, enableHighAccuracy: false });
  };
  const changeQuery = (value: string) => { locationAttempt.current++; setLocating(false); setErrorKind(null); patch({ query: value, nearby: false }); };
  return { search, busy, locating, error, errorKind, retry: () => run(lastRequest.current), nearMe, changeQuery };
}
