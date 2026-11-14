import type { FormEvent } from 'react';
import { BarcodeGlyph, CloseGlyph, SearchGlyph } from './homeIcons';

export const SHELF_SEARCH_ID = 'shelf-search';

/**
 * The search bar that is always at the top of the home screen, with the scan
 * button inside it. The home screen holds the typed text in memory only:
 * never in the URL, history state or browser storage. `active` is true while
 * results (or a search) are shown; × then also goes back to the shelf.
 * Without `onScan` (desktop widths) there is no scan button: a typed ISBN
 * still goes straight to the book.
 */
export function SearchBar({ value, onChange, onSubmit, onClear, onScan, active = false }: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onClear: () => void;
  onScan?: () => void;
  active?: boolean;
}) {
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit(value); };
  return <form className={'search-bar' + (active ? ' search-bar-active' : '') + (onScan ? '' : ' search-bar-no-scan')} role="search" onSubmit={submit}>
    <span className="search-bar-icon" aria-hidden="true"><SearchGlyph /></span>
    <input id={SHELF_SEARCH_ID} type="search" aria-label="Search for a book" placeholder="Title, author or ISBN" value={value}
      onChange={event => onChange(event.target.value)} maxLength={160} autoComplete="off" spellCheck={false} enterKeyHint="search" />
    {(value || active) && <button type="button" className="search-bar-clear" aria-label={active ? 'Clear search and go back to my shelf' : 'Clear search'} onClick={onClear}><CloseGlyph size={20} /></button>}
    {onScan && <button type="button" className="search-bar-scan" aria-label="Scan a barcode" onClick={onScan}><BarcodeGlyph /></button>}
  </form>;
}
