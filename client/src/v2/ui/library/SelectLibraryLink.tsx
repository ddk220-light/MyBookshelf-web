import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { publicApi, PublicApiError } from '../../api';
import { safeBookReturn, type LibraryNavigation } from '../../bookNavigation';
import { useLibrary } from '../../context';
import { uiMessages as m } from '../../uiMessages';

/** Where a shared library link goes after choosing the library: the book in ?book=, an allowed ?next=, or the shelf. */
export function selectionTarget(search: string, navigation: LibraryNavigation | null): string {
  const params = new URLSearchParams(search);
  const sharedBook = params.get('book');
  const sharedReturn = sharedBook ? safeBookReturn('/app/books/' + encodeURIComponent(sharedBook) + '?' + params) : null;
  const next = params.get('next');
  // Search, Libraries and Settings are no longer pages in the one-shelf app: they all start on the shelf.
  // A ?q= is never carried on: search text stays out of the address.
  const nextBook = next && next.startsWith('/app/books/') ? safeBookReturn(next) : null;
  return safeBookReturn(navigation?.after) || sharedReturn || nextBook || '/app/shelf';
}

export type LibraryLinkNotice = 'missing' | 'unavailable';
export const libraryLinkMessage = (notice: LibraryLinkNotice) => notice === 'missing' ? m.libraryLinkMissing : m.libraryLinkUnavailable;

/**
 * A shared library link or a library guide page's link (/select/<slug>), in
 * the one-shelf app: the library is chosen without asking and the reader
 * goes on to the book or the shelf (plan Phase 7, row 31: it replaces a
 * previously chosen library; the saved shelf is untouched). A link that
 * does not resolve lands on the shelf with the existing "link not found"
 * notice.
 */
export function SelectLibraryLink() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { selectLibrary } = useLibrary();
  const target = useRef(selectionTarget(location.search, location.state as LibraryNavigation | null));
  const select = useRef(selectLibrary);
  select.current = selectLibrary;

  useEffect(() => {
    const controller = new AbortController();
    const fail = (notice: LibraryLinkNotice) => navigate('/app/shelf', { replace: true, state: { libraryLink: notice } });
    if (!slug) { fail('missing'); return; }
    publicApi.resolveLibraryLink(slug, controller.signal).then(async library => {
      if (controller.signal.aborted) return;
      await select.current(library).catch(() => false);
      if (!controller.signal.aborted) navigate(target.current, { replace: true });
    }).catch(error => {
      if (controller.signal.aborted) return;
      fail(error instanceof PublicApiError && [400, 404].includes(error.status) ? 'missing' : 'unavailable');
    });
    return () => controller.abort();
  }, [slug, navigate]);

  return <section className="page-section"><p role="status">{m.openingLibraryLink}</p></section>;
}
