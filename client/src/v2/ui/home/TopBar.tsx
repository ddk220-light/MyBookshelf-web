import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import type { LayoutMode } from '../desk/layoutMode';
import { SettingsGlyph } from './homeIcons';
import { SearchBar } from './SearchBar';

/**
 * Person icon (opens the side panel), wordmark (a link to the public About
 * page), the search bar with the scan
 * button, and under it the chosen library's name as plain text (or, while
 * results are shown, `leading`: "Back to my reading shelf").
 *
 * Rail widths: no person icon (the rail holds the account). Wide widths
 * (DeskShelf board): the wordmark and the library are in the left column,
 * so the bar is only the search bar with the view switch (`trailing`) beside
 * it; `leading` is drawn under it by the caller.
 *
 * Cold open (`intro`, SuggestFirstOpen and DeskSuggestFirst boards): the
 * intro ("Ready to search") stands above a larger search bar, and the bar
 * does not stay at the top while scrolling. The search bar keeps its place
 * in the tree either way, so it keeps focus and text when the intro goes.
 */
export const TopBar = forwardRef<HTMLButtonElement, {
  panelOpen: boolean;
  onOpenPanel: () => void;
  search: ComponentProps<typeof SearchBar>;
  leading?: ReactNode;
  trailing?: ReactNode;
  layout?: LayoutMode;
  intro?: ReactNode;
}>(function TopBar({ panelOpen, onOpenPanel, search, leading, trailing, layout = 'phone', intro }, settingsButton) {
  const cold = intro ? ' home-top-cold' : '';
  if (layout === 'wide') return <header className={'home-top desk-top' + cold}>
    {intro}
    <div className="desk-search-row">
      <SearchBar {...search} />
      {trailing}
    </div>
  </header>;
  return <header className={'home-top' + cold}>
    <div className="home-brand">
      {layout === 'phone' && <button type="button" ref={settingsButton} className="home-person" aria-label="Settings" aria-haspopup="dialog" aria-expanded={panelOpen} onClick={onOpenPanel}><SettingsGlyph /></button>}
      <a className="home-wordmark" href="/about">MyBookshelf</a>
    </div>
    {intro}
    <SearchBar {...search} />
    {(leading || trailing) && <div className="home-meta">
      {leading || <span />}
      {trailing}
    </div>}
  </header>;
});
