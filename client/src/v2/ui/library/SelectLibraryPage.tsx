import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { publicApi, PublicApiError } from '../../api';
import { useLibrary } from '../../context';
import { uiMessages as m } from '../../uiMessages';
import { Notice } from '../Notice';
import { LibraryCard } from './LibraryCard';
import type { PublicLibrary } from '../../types';
import type { LibraryNavigation } from '../../bookNavigation';
import { safeBookReturn } from '../../bookNavigation';
import { Sheet } from '../Sheet';

export function SelectLibraryPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const navigation = location.state as LibraryNavigation | null;
  const params = new URLSearchParams(location.search);
  const sharedBook = params.get('book');
  const sharedReturn = sharedBook ? safeBookReturn('/app/books/' + encodeURIComponent(sharedBook) + '?' + params) : null;
  const next = params.get('next');
  const appNext = next === '/app/search' || next === '/app/shelf' || next === '/app/libraries' || next === '/app/settings' ? next : safeBookReturn(next);
  const query = (params.get('q') || '').slice(0, 120);
  const returnTo = safeBookReturn(navigation?.after) || sharedReturn || (appNext ? appNext + (appNext === '/app/search' && query ? '?q=' + encodeURIComponent(query) : '') : '/app/search');
  const { selectLibrary, library: selected, recoveryMode } = useLibrary();
  const [library, setLibrary] = useState<PublicLibrary | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<'missing' | 'unavailable' | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setFailure(null);
    setLibrary(null);
    if (!slug) { setFailure('missing'); return; }
    publicApi.resolveLibraryLink(slug, controller.signal).then(library => {
      if (controller.signal.aborted) return;
      setLibrary(library);
    }).catch(error => {
      if (!controller.signal.aborted) setFailure(error instanceof PublicApiError && [400, 404].includes(error.status) ? 'missing' : 'unavailable');
    });
    return () => controller.abort();
  }, [slug, attempt]);

  return <section className="page-section shared-library-page">
    <Sheet open title="Choose this library?" onClose={() => navigate(returnTo, { replace: true, state: navigation?.bookNavigation })}>
    {library ? <><LibraryCard library={library} />
      {selected && selected.id !== library.id && <p>Current library: {selected.name}</p>}
      <div className="shared-library-actions"><button disabled={recoveryMode} onClick={() => { selectLibrary(library); navigate(returnTo, { replace: true, state: { ...navigation?.bookNavigation, focusSearch: true } }); }}>Choose {library.name}</button>
      <Link className="button-quiet" to={returnTo} replace state={navigation?.bookNavigation}>Cancel</Link></div>
    </> : !failure ? <p role="status">{m.openingLibraryLink}</p> : <>
      <Notice tone="error">{failure === 'missing' ? m.libraryLinkMissing : m.libraryLinkUnavailable}</Notice>
      {failure === 'unavailable' && <button onClick={() => setAttempt(value => value + 1)}>{m.retry}</button>}
      <Link className="text-link" to="/app/libraries">{m.chooseLibrary}</Link>
    </>}
    </Sheet>
  </section>;
}
