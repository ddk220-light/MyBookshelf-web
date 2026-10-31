import { useState } from 'react';
import type { PublicLibrary } from '../../types';
import { publicLibraryPath } from '../../publicPages';
import { CopyLibraryLink } from './CopyLibraryLink';
import { libraryFeatures } from './libraryPresentation';

export function LibraryDetail({ library, onChoose, selected, currentName, onChange, disabled = false, bookReturn }: { library: PublicLibrary; onChoose: () => void; selected: boolean; currentName?: string; onChange?: () => void; disabled?: boolean; bookReturn?: string | null }) {
  const [allBranches, setAllBranches] = useState(false);
  const branches = (library.branches || []).filter(branch => !['locker', 'mobile'].includes(branch.kind));
  const services = (library.branches || []).filter(branch => ['locker', 'mobile'].includes(branch.kind));
  const publicPath = publicLibraryPath(library.id);
  return <article className="library-detail">
    <header><h2>{library.name}</h2><p>{[...new Set([library.city, library.district, library.region].filter(Boolean))].join(' · ')}</p></header>
    <div className="library-detail-actions">{selected ? <p className="your-library-bar">✓ Your library {onChange && <button className="text-button" onClick={onChange}>Change</button>}</p> : <><button disabled={disabled} onClick={onChoose}>Choose {library.name}</button>{currentName && <p className="muted">Replaces {currentName}</p>}</>}</div>
    <section><h3>What we can check here</h3><ul>{libraryFeatures(library).map(feature => <li key={feature}>{feature}</li>)}</ul>
      {!library.capabilities.locationAvailability && <p>This connection does not show which branch has a copy.</p>}
      {library.accessNote && <p>{library.accessNote}</p>}
      {library.catalogUrl && <a className="text-link" href={library.catalogUrl} target="_blank" rel="noopener noreferrer">Open library catalog ↗</a>}
      {library.catalogUrl?.startsWith('http:') && <p className="form-hint">This catalog link uses HTTP, which is not encrypted.</p>}
    </section>
    {library.address && <section><h3>Address</h3><p>{library.address}</p>{library.addressSourceUrl && <a href={library.addressSourceUrl} target="_blank" rel="noopener noreferrer">Address source ↗</a>}</section>}
    {branches.length > 0 && <section><h3>{library.branchClassification === 'complete' && library.branchCount != null ? library.branchCount + ' library ' + (library.branchCount === 1 ? 'branch' : 'branches') : 'Catalog locations'}</h3>
      <ul className="branch-detail-list">{branches.slice(0, allBranches ? branches.length : 5).map(branch => <li key={branch.id}><strong>{branch.name}</strong>{branch.address && <p>{branch.address}</p>}</li>)}</ul>
      {branches.length > 5 && <button className="text-button" aria-expanded={allBranches} onClick={() => setAllBranches(value => !value)}>{allBranches ? 'Show fewer locations' : 'Show ' + (branches.length - 5) + ' more'}</button>}
    </section>}
    {services.length > 0 && <p className="form-hint">Other services: {services.map(branch => branch.name + (branch.kind === 'locker' ? ' (pickup locker)' : ' (mobile service)')).join(' · ')}</p>}
    {publicPath && <p><a className="text-link" href={publicPath}>About this library ↗</a></p>}
    <div className="library-detail-actions"><CopyLibraryLink library={library} bookReturn={bookReturn} /></div>
  </article>;
}
