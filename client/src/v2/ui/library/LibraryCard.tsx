import { distanceLabel } from './libraryPresentation';
import type { ReactNode, CSSProperties } from 'react';
import type { PublicLibrary } from '../../types';
import { uiMessages as m } from '../../uiMessages';
import { LibraryIcon } from '../icons';
import { LibraryAttribution } from '../LibraryAttribution';
import { accessSummary } from '../journal/DueSlip';

export function LibraryCard({ library, compact = false, selected = false, children }: {
  library: PublicLibrary; compact?: boolean; selected?: boolean; children?: ReactNode;
}) {
  let hash = 0;
  for (const char of library.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  // All three bands exceed AA contrast with the cream label.
  const band = ['#2f5340', '#2e5770', '#7a2f28'][hash % 3];
  return <article className={`reading-library-card${compact ? ' compact' : ''}`} style={{ '--library-band': band } as CSSProperties}>
    <div className="library-band"><span>{selected ? m.yourLibrary : m.libraries}</span><LibraryIcon /></div>
    <div className="library-card-body">
      <div className="library-card-top"><div>{compact ? <strong>{library.name}</strong> : <h2>{library.name}</h2>}
        <p>{[...new Set([library.city, library.district, library.region].filter(Boolean))].join(' · ')}</p>
      </div>{library.distanceKm !== undefined && <span className="distance-badge">{distanceLabel(library.distanceKm, library.country, library.distanceApproximate)}</span>}</div>
      {!compact && <>
        {library.locations?.[0] && library.locations[0].name !== library.name && <p className="branch-line">{library.distanceKm !== undefined ? 'Nearest mapped branch' : 'Mapped branch'}: {library.locations[0].name}</p>}
        {(library.distanceApproximate || library.locations?.some(point => point.precision === 'area' || point.precision === 'campus')) && <p className="map-note">Approximate campus or area location</p>}
        <p className="library-capability">{library.search?.mode === 'external' ? m.catalogExternal : library.capabilities.publicAvailability ? m.checkAvailabilityHere : m.catalogSearch}</p>
        {accessSummary(library.accessNote) && <p className="access-note">{accessSummary(library.accessNote)}</p>}
        {(library.address || library.accessNote) && <details className="library-more"><summary>{m.libraryDetailsLabel}</summary>{library.address && <p>{library.address}</p>}{library.accessNote && <p>{library.accessNote}</p>}</details>}
        <span className="decorative-barcode" aria-hidden="true" />
      </>}
      {children}
      <LibraryAttribution attribution={library.attribution} />
    </div>
  </article>;
}
