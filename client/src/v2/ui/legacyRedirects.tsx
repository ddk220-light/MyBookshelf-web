import { isContentSourceRetired } from '../../../../shared/content-source-availability.mjs';
import { Navigate, useLocation } from 'react-router-dom';
import { handOffLegacyText } from '../legacyHandoff';
import { KnowledgeSearchPage } from './content/KnowledgeSearchPage';
import { ContentSearchPage } from './content/ContentSearchPage';

// Old addresses of the screens the one-shelf app replaced (plan Phase 12
// redirect table). Search, Libraries and Settings are no longer pages: each
// lands on the shelf with the matching overlay. Every redirect is a
// `replace`, so the old address does not stay in the session history, and
// typed text (`q`) never reaches the new address, history state or storage
// (legacyHandoff.ts).

/** History state the home screen reads once and then removes. */
export type LegacyArrival = { legacy?: 'search' | 'library' | 'focus-search' };

const contentDiscovery = () => import.meta.env.VITE_CONTENT_DISCOVERY_ENABLED === 'true';

/**
 * /app/search: the shelf with the search bar focused; with `?q=` the shelf
 * runs that search once. `?scope=free|papers|knowledge` opens the hidden
 * free-reading pages only in a build with VITE_CONTENT_DISCOVERY_ENABLED;
 * otherwise it is the shelf too (and its `q` is dropped, not searched).
 */
export function SearchRedirect() {
  const params = new URLSearchParams(useLocation().search);
  const scope = params.get('scope');
  if (scope && ['free', 'papers', 'knowledge'].includes(scope)) {
    if (contentDiscovery()) return <ContentScope params={params} scope={scope as 'free' | 'papers' | 'knowledge'} />;
    return <Navigate to="/app/shelf" replace state={null} />;
  }
  const state: LegacyArrival = handOffLegacyText('search', params.get('q')) ? { legacy: 'search' } : { legacy: 'focus-search' };
  return <Navigate to="/app/shelf" replace state={state} />;
}

// The free-reading pages as they were reached from the old Search page.
function ContentScope({ params, scope }: { params: URLSearchParams; scope: 'free' | 'papers' | 'knowledge' }) {
  if (scope === 'free' && params.get('collection') === 'children' && isContentSourceRetired('storyweaver')) {
    params.set('scope', 'knowledge');
    for (const key of ['collection', 'level', 'item', 'source']) params.delete(key);
    return <Navigate replace to={'/app/search?' + params} />;
  }
  if (scope === 'knowledge' && isContentSourceRetired(params.get('source'))) {
    params.delete('source');
    return <Navigate replace to={'/app/search?' + params} />;
  }
  if (scope === 'knowledge') return <KnowledgeSearchPage />;
  return <ContentSearchPage key={scope} scope={scope} />;
}

/**
 * /app/libraries: the shelf with the library pop-up open; `?q=` is copied
 * into the pop-up's field. `?book=<key>` opens that book with the pop-up
 * over it.
 */
export function LibrariesRedirect() {
  const params = new URLSearchParams(useLocation().search);
  const book = params.get('book');
  if (book) return <Navigate to={'/app/books/' + encodeURIComponent(book)} replace state={{ overlay: 'library' }} />;
  const state: LegacyArrival & { overlay: 'library' } = { overlay: 'library', ...(handOffLegacyText('library', params.get('q')) ? { legacy: 'library' as const } : {}) };
  return <Navigate to="/app/shelf" replace state={state} />;
}

/** /app/settings: the side panel on the shelf; /app/settings#privacy is the Privacy page. */
export function SettingsRedirect() {
  const { hash } = useLocation();
  if (hash === '#privacy') return <Navigate to="/app/privacy" replace />;
  return <Navigate to="/app/shelf" replace state={{ overlay: 'panel' }} />;
}
