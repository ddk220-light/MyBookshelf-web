import { useState, type FormEvent } from 'react';
import { BarcodeGlyph, CloseGlyph, SearchGlyph } from './homeIcons';

export const SHELF_SEARCH_ID = 'shelf-search';

/**
 * The search bar that is always at the top of the home screen, with the scan
 * button inside it. The typed text lives in this component's memory only:
 * never in the URL or browser storage.
 */
export function SearchBar({ onSubmit, onScan }: { onSubmit: () => void; onScan: () => void }) {
  const [query, setQuery] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit(); };
  return <form className="search-bar" role="search" onSubmit={submit}>
    <span className="search-bar-icon" aria-hidden="true"><SearchGlyph /></span>
    <input id={SHELF_SEARCH_ID} type="search" aria-label="Search for a book" placeholder="Title, author or ISBN" value={query}
      onChange={event => setQuery(event.target.value)} maxLength={160} autoComplete="off" spellCheck={false} enterKeyHint="search" />
    {query && <button type="button" className="search-bar-clear" aria-label="Clear search" onClick={() => { setQuery(''); document.getElementById(SHELF_SEARCH_ID)?.focus(); }}><CloseGlyph size={20} /></button>}
    <button type="button" className="search-bar-scan" aria-label="Scan a barcode" onClick={onScan}><BarcodeGlyph /></button>
  </form>;
}
