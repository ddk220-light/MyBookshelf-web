import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import type { LayoutMode } from '../desk/layoutMode';
import { PersonIcon } from './homeIcons';
import { SearchBar } from './SearchBar';

/**
 * Person icon (opens the side panel), wordmark, the search bar with the scan
 * button, and under it the chosen library's name as plain text (or, while
 * results are shown, `leading`: "Back to my shelf").
 *
 * Rail widths: no person icon (the rail holds the account). Wide widths
 * (DeskShelf board): the wordmark and the library are in the left column,
 * so the bar is only the search bar with the view switch (`trailing`) beside
 * it; `leading` is drawn under it by the caller.
 */
export const TopBar = forwardRef<HTMLButtonElement, {
  panelOpen: boolean;
  onOpenPanel: () => void;
  search: ComponentProps<typeof SearchBar>;
  libraryName: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
  layout?: LayoutMode;
}>(function TopBar({ panelOpen, onOpenPanel, search, libraryName, leading, trailing, layout = 'phone' }, personButton) {
  if (layout === 'wide') return <header className="home-top desk-top">
    <div className="desk-search-row">
      <SearchBar {...search} />
      {trailing}
    </div>
  </header>;
  const start = leading ?? (libraryName ? <p className="home-library">{libraryName}</p> : null);
  return <header className="home-top">
    <div className="home-brand">
      {layout === 'phone' && <button type="button" ref={personButton} className="home-person" aria-label="Account and settings" aria-haspopup="dialog" aria-expanded={panelOpen} onClick={onOpenPanel}><PersonIcon /></button>}
      <span className="home-wordmark">MyBookshelf</span>
    </div>
    <SearchBar {...search} />
    {(start || trailing) && <div className="home-meta">
      {start || <span />}
      {trailing}
    </div>}
  </header>;
});
