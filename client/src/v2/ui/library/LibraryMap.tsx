import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapBounds, Place, PublicLibrary } from '../../types';

type Props = { libraries: PublicLibrary[]; center: Place | null; radiusKm: number; selected: string | null;
  focusRequest: { libraryId: string; sequence: number } | null;
  searchKey: string; onHighlight: (id: string) => void; onSearchArea: (bounds: MapBounds, center: Place) => void; busy: boolean };

export default function LibraryMap({ libraries, center, radiusKm, selected, focusRequest, searchKey, onHighlight, onSearchArea, busy }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const onHighlightRef = useRef(onHighlight);
  const previousSearch = useRef('');
  const previousFocus = useRef<number | null>(null);
  const [moved, setMoved] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [zoom, setZoom] = useState(2);
  onHighlightRef.current = onHighlight;

  useEffect(() => {
    if (!container.current) return;
    const current = L.map(container.current, { scrollWheelZoom: false, zoomControl: true, worldCopyJump: true }).setView([20, 0], 2);
    map.current = current;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, minZoom: 2,
      referrerPolicy: 'origin', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors' })
      .on('tileerror', () => setTileError(true)).addTo(current);
    layer.current = L.layerGroup().addTo(current);
    current.on('moveend', () => setMoved(true));
    current.on('zoomend', () => setZoom(current.getZoom()));
    const resize = new ResizeObserver(() => current.invalidateSize());
    resize.observe(container.current);
    return () => { resize.disconnect(); current.remove(); map.current = null; layer.current = null; previousSearch.current = ''; };
  }, []);

  useEffect(() => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    const points: L.LatLngTuple[] = [];
    const groups = new Map<string, Array<{ library: PublicLibrary; point: NonNullable<PublicLibrary['locations']>[number] }>>();
    for (const library of libraries) for (const point of library.locations || []) {
      const projected = map.current.project([point.lat, point.lon], zoom);
      const key = zoom < 15 ? `${Math.floor(projected.x / 46)}:${Math.floor(projected.y / 46)}` : `${library.id}:${point.id}`;
      const group = groups.get(key) || []; group.push({ library, point }); groups.set(key, group);
      points.push([point.lat, point.lon]);
    }
    for (const group of groups.values()) {
      if (group.length > 1) {
        const bounds = L.latLngBounds(group.map(({ point }) => [point.lat, point.lon] as L.LatLngTuple));
        const label = `${group.length} library locations. Select to zoom in.`;
        const marker = L.marker(bounds.getCenter(), { title: label, keyboard: true,
          icon: L.divIcon({ className: `library-map-cluster${group.some(({ library }) => library.id === selected) ? ' is-selected' : ''}`, html: `<span>${group.length}</span>`, iconSize: [40, 40] }) });
        marker.on('click', () => map.current?.fitBounds(bounds, { maxZoom: Math.min(zoom + 2, 16), padding: [35, 35] })).addTo(layer.current);
        marker.getElement()?.setAttribute('aria-label', label);
        continue;
      }
      const { library, point } = group[0];
      const approximate = point.precision === 'campus' || point.precision === 'area';
      const label = `${point.name}${point.name !== library.name ? ` · ${library.name}` : ''}${approximate ? ' · approximate location' : ''}`;
      const marker = L.marker([point.lat, point.lon], { title: label, alt: label, keyboard: true,
        icon: L.divIcon({ className: `library-map-pin${selected === library.id ? ' is-selected' : ''}${approximate ? ' is-approximate' : ''}`,
          html: '<span aria-hidden="true"></span>', iconSize: [32, 40], iconAnchor: [16, 40] }) });
      const tooltip = document.createElement('span'); tooltip.textContent = label;
      marker.bindTooltip(tooltip).on('click', () => onHighlightRef.current(library.id)).addTo(layer.current);
      marker.getElement()?.setAttribute('aria-label', label);
    }
    if (searchKey !== previousSearch.current) {
      if (!searchKey.includes('"bounds"')) {
        if (center) {
          const bounds = L.latLng(center.lat, center.lon).toBounds(radiusKm * 2000);
          map.current.fitBounds(bounds, { maxZoom: 13, animate: false, padding: [24, 24] });
        } else if (points.length) map.current.fitBounds(L.latLngBounds(points), { maxZoom: 14, animate: false, padding: [36, 36] });
      }
      previousSearch.current = searchKey;
      setMoved(false);
    }
  }, [libraries, center, radiusKm, selected, searchKey, zoom]);

  useEffect(() => {
    if (!focusRequest || !map.current || previousFocus.current === focusRequest.sequence) return;
    const locations = libraries.find(library => library.id === focusRequest.libraryId)?.locations || [];
    if (!locations.length) return;
    previousFocus.current = focusRequest.sequence;
    map.current.fitBounds(L.latLngBounds(locations.map(point => [point.lat, point.lon] as L.LatLngTuple)), { maxZoom: 14, padding: [35, 35] });
    container.current?.closest('.library-map-panel')?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [focusRequest, libraries]);

  const searchArea = () => {
    const current = map.current;
    if (!current) return;
    const b = current.getBounds(), c = current.getCenter().wrap();
    const wrap = (lon: number) => ((lon + 180) % 360 + 360) % 360 - 180;
    onSearchArea({ north: Math.min(90, b.getNorth()), south: Math.max(-90, b.getSouth()),
      west: b.getEast() - b.getWest() >= 360 ? -180 : wrap(b.getWest()), east: b.getEast() - b.getWest() >= 360 ? 180 : wrap(b.getEast()) },
      { id: 'map-area', label: 'This map area', lat: c.lat, lon: c.lng });
    setMoved(false);
  };
  return <section className="library-map-panel" aria-label="Library map">
    <div className="map-toolbar"><span>Explore the map</span><button className="button-quiet" onClick={searchArea} disabled={busy}>{moved ? 'Search this area' : 'Search map area'}</button></div>
    <div ref={container} className="library-map" aria-label="Map of library locations. Use arrow keys to move and plus or minus to zoom." />
    <div className="map-pan-controls" aria-label="Move map">
      <button className="button-quiet" aria-label="Move map west" onClick={() => map.current?.panBy([-180, 0])}>←</button>
      <button className="button-quiet" aria-label="Move map north" onClick={() => map.current?.panBy([0, -180])}>↑</button>
      <button className="button-quiet" aria-label="Move map south" onClick={() => map.current?.panBy([0, 180])}>↓</button>
      <button className="button-quiet" aria-label="Move map east" onClick={() => map.current?.panBy([180, 0])}>→</button>
      {center && <button className="button-quiet" onClick={() => map.current?.setView([center.lat, center.lon], 11)}>Recenter</button>}
    </div>
    {tileError && <p className="map-note" role="status">Some map tiles could not load. Library results are still available in the list.</p>}
    <p className="map-note">Select a pin to highlight its library. Dashed pins show an approximate campus or area location. Pins describe locations, not book availability.</p>
  </section>;
}
