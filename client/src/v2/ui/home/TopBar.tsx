import { forwardRef, type ReactNode } from 'react';
import { PersonIcon } from './homeIcons';
import { SearchBar } from './SearchBar';

/**
 * Person icon (opens the side panel), wordmark, the search bar with the scan
 * button, and under it the chosen library's name as plain text.
 */
export const TopBar = forwardRef<HTMLButtonElement, {
  panelOpen: boolean;
  onOpenPanel: () => void;
  onSearch: () => void;
  onScan: () => void;
  libraryName: string | null;
  trailing?: ReactNode;
}>(function TopBar({ panelOpen, onOpenPanel, onSearch, onScan, libraryName, trailing }, personButton) {
  return <header className="home-top">
    <div className="home-brand">
      <button type="button" ref={personButton} className="home-person" aria-label="Account and settings" aria-haspopup="dialog" aria-expanded={panelOpen} onClick={onOpenPanel}><PersonIcon /></button>
      <span className="home-wordmark">MyBookshelf</span>
    </div>
    <SearchBar onSubmit={onSearch} onScan={onScan} />
    {(libraryName || trailing) && <div className="home-meta">
      {libraryName ? <p className="home-library">{libraryName}</p> : <span />}
      {trailing}
    </div>}
  </header>;
});
