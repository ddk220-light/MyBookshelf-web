import { useState } from 'react';
import type { PublicLibrary } from '../../types';
import { uiMessages as m } from '../../uiMessages';
import { safeBookReturn } from '../../bookNavigation';

export function CopyLibraryLink({ library, bookReturn }: { library: PublicLibrary; bookReturn?: string | null }) {
  const [copied, setCopied] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  if (!library.selectionPath) return null;
  const copy = async () => {
    const link = new URL(library.selectionPath!, window.location.origin);
    const destination = safeBookReturn(bookReturn);
    if (destination) {
      const book = new URL(destination, window.location.origin);
      link.searchParams.set('book', decodeURIComponent(book.pathname.slice('/app/books/'.length)));
      for (const field of ['edition', 'language']) if (book.searchParams.has(field)) link.searchParams.set(field, book.searchParams.get(field)!);
    }
    const url = link.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true); setManualUrl('');
    } catch { setCopied(false); setManualUrl(url); }
  };
  return <span className="library-share">
    <button type="button" className="text-button" onClick={() => void copy()} aria-label={m.copyLibraryLinkFor(library.name)}>{m.copyLibraryLink}</button>
    <span role="status">{copied ? m.libraryLinkCopied : ''}</span>
    {manualUrl && <label>{m.copyLibraryLinkManually}<input aria-label={m.libraryLink} readOnly value={manualUrl} onFocus={event => event.target.select()} /></label>}
  </span>;
}
