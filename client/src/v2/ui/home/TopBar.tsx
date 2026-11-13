import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import { PersonIcon } from './homeIcons';
import { SearchBar } from './SearchBar';

/**
 * Person icon (opens the side panel), wordmark, the search bar with the scan
 * button, and under it the chosen library's name as plain text (or, while
 * results are shown, `leading`: "Back to my shelf").
 */
export const TopBar = forwardRef<HTMLButtonElement, {
  panelOpen: boolean;
  onOpenPanel: () => void;
  search: ComponentProps<typeof SearchBar>;
  libraryName: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
}>(function TopBar({ panelOpen, onOpenPanel, search, libraryName, leading, trailing }, personButton) {
  const start = leading ?? (libraryName ? <p className="home-library">{libraryName}</p> : null);
  return <header className="home-top">
    <div className="home-brand">
      <button type="button" ref={personButton} className="home-person" aria-label="Account and settings" aria-haspopup="dialog" aria-expanded={panelOpen} onClick={onOpenPanel}><PersonIcon /></button>
      <span className="home-wordmark">MyBookshelf</span>
    </div>
    <SearchBar {...search} />
    {(start || trailing) && <div className="home-meta">
      {start || <span />}
      {trailing}
    </div>}
  </header>;
});
