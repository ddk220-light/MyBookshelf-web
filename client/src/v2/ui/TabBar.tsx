import { Link, NavLink, useLocation } from 'react-router-dom';
import { LibraryIcon, SearchIcon, SettingsIcon, ShelfIcon } from './icons';
import { uiMessages as m } from '../uiMessages';
import { libraryReturn } from '../bookNavigation';
import {useAccountSession} from '../auth/AccountSessionProvider';

const TABS = [
  { to: '/app/shelf', label: m.shelf, icon: ShelfIcon },
  { to: '/app/search', label: m.search, icon: SearchIcon },
  { to: '/app/libraries', label: m.libraries, icon: LibraryIcon },
  { to: '/app/settings', label: m.settings, icon: SettingsIcon },
];

// One navigation and one route tree: CSS switches the desktop sidebar and
// mobile bottom bar without remounting the reader's page or camera.
export function TabBar() {
  const {session}=useAccountSession();
  const location = useLocation();
  const encodedBookKey = location.pathname.match(/^\/app\/books\/([^/]+)$/)?.[1];
  return <aside className="app-navigation" aria-label={m.appNavigation}>
    <Link className="desktop-brand" to="/app/shelf" aria-label={m.homeLabel}>
      <span>myBookshelf</span>
    </Link>
    <nav className="tab-bar" aria-label="Primary navigation">
      {TABS.map(({ to, label, icon: Icon }) => (
        to === '/app/search' && location.pathname.startsWith('/app/read/') ? <Link key={to} to={to} className="tab-item active" aria-current="page"><span className="tab-icon"><Icon /></span>{label}</Link> :
        <NavLink key={to} to={to === '/app/libraries' && encodedBookKey ? `/app/libraries?book=${encodedBookKey}` : to}
          aria-keyshortcuts={to === '/app/search' ? 'Alt+/' : undefined}
          state={to === '/app/libraries' && encodedBookKey ? libraryReturn(location.pathname, location.search, location.state) : undefined} className="tab-item">
          <span className="tab-icon"><Icon /></span><span className="tab-label">{label}</span>
        </NavLink>
      ))}
    </nav>
    <div className="desktop-account">{session.status==='authenticated'?<><strong>{session.user?.name}</strong><span>{session.user?.email}</span><Link to="/app/settings/account">Your account</Link></>:<Link to="/app/account/sign-in">Sign in</Link>}</div>
    <a className="desktop-support" href="/support" aria-label={m.supportLabel}>{m.helpSupport} <span aria-hidden="true">↗</span></a>
  </aside>;
}
