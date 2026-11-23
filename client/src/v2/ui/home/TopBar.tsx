import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import type { LayoutMode } from '../desk/layoutMode';
import { SettingsGlyph } from './homeIcons';
import { SearchBar } from './SearchBar';

/**
 * The wordmark (a link to the public About page) with the settings gear
 * opposite it at the top right (opens the side panel; Main board), the search
 * bar with the scan button, and under it the chosen library (or, while
 * results are shown, `leading`: "Back to my reading shelf").
 *
 * Rail widths: no gear here (the rail holds it). Wide widths
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
      <a className="home-wordmark" href="/about">MyBookshelf</a>
      {layout === 'phone' && <button type="button" ref={settingsButton} className="home-person" aria-label="Settings" aria-haspopup="dialog" aria-expanded={panelOpen} onClick={onOpenPanel}><SettingsGlyph /></button>}
    </div>
    {intro}
    <SearchBar {...search} />
    {(leading || trailing) && <div className="home-meta">
      {leading || <span />}
      {trailing}
    </div>}
  </header>;
});
