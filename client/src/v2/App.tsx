import {lazy,Suspense,useLayoutEffect,useRef} from 'react';
import { Link, Navigate, Route, Routes,useLocation,useNavigate } from 'react-router-dom';
import {AccountSessionProvider,useAccountSession} from './auth/AccountSessionProvider';
import {LinkTokenProvider} from './auth/LinkTokenProvider';
import {RecentAuthProvider} from './auth/RecentAuthProvider';
import {DeletionReceiptProvider} from './auth/DeletionReceiptProvider';
import {safeAccountReturn} from './auth/accountClient';
import {ImportPage,EmailChangePage,ProviderReturnPage,CompleteProfilePage} from './ui/account/AccountPages';
import {AccountSettingsPage} from './ui/account/AccountSettingsPage';
import {AccountEntryGate} from './ui/account/AccountEntryGate';
import { LibraryStateProvider } from './context';
import { AppFrame } from './ui/AppFrame';
import { ContentDetailPage } from './ui/content/ContentDetailPage';
import { OneShelfRoot } from './OneShelfRoot';
import { HomeScreen } from './ui/home/HomeScreen';
import { ShelfBookPage } from './ui/book/ShelfBookPage';
import { SelectLibraryLink } from './ui/library/SelectLibraryLink';
import { AccountSettingsSmall } from './ui/account/AccountSettingsSmall';
import { CreateAccountPage, DeletionDonePage, LogInPage, NewPasswordPage, ResetRequestPage, VerifyEmailPage } from './ui/account/OneShelfAccountPages';
import { ReportProblemPage } from './ui/panel/ReportProblemPage';
import { AboutPage, PrivacyPage, TermsPage } from './ui/panel/PolicyPages';
import { LibrariesRedirect, SearchRedirect, SettingsRedirect } from './ui/legacyRedirects';

// The owner-only admin view (plan section 6): its own chunk, linked from no
// screen, noindex. The server answers 404 to anyone but the owner.
const AdminPage = lazy(() => import('./ui/admin/AdminPage'));

function NativeAppNotice() {
  return <section className="page-section prose"><h1>Find your next read</h1><p>No sign-in needed.</p><Link className="button-link" to="/app/shelf">Open my shelf</Link></section>;
}

function NotFoundPage() {
  // The frame's "My shelf" link above the heading leads back.
  return <section className="page-section prose"><h1>Page not found</h1></section>;
}

export function AnonymousWebApp() {
  return <AccountSessionProvider disabledMeansGuest><DeletionReceiptProvider><RecentAuthProvider><LinkTokenProvider><IdentityApp/></LinkTokenProvider></RecentAuthProvider></DeletionReceiptProvider></AccountSessionProvider>;
}
function IdentityApp(){
  const {session,continueGuest}=useAccountSession(),navigate=useNavigate(),location=useLocation();
  const prior=useRef<string|null>(null),current=session.status==='authenticated'?session.user?.id||null:null;
  const entryMode=/^\/app\/account\/(sign-in|sign-up|verify|forgot-password|reset-password|email-change|return|complete-profile|deletion)$/.test(location.pathname);
  const redirect=prior.current!==null&&prior.current!==current&&!entryMode;
  const incomplete=session.status==='authenticated'&&session.needsProfileCompletion&&!entryMode;
  useLayoutEffect(()=>{if(redirect)navigate('/app/shelf',{replace:true,state:null});else if(incomplete)navigate('/app/account/complete-profile?returnTo='+encodeURIComponent(safeAccountReturn(location.pathname+location.search)),{replace:true,state:null});prior.current=current;},[current,redirect,incomplete,navigate,location.pathname,location.search]);
  if(redirect||incomplete)return <p role="status">Updating your account…</p>;
  // Mount forms only after bootstrap selects their repository, so a typed
  // public search is not replaced by the checking→guest transition.
  if(session.status==='checking'&&!entryMode)return <section className="page-section"><p role="status">Checking your account…</p><button type="button" onClick={continueGuest}>Continue using this browser</button></section>;
  const key=entryMode?'account-entry':session.epoch;
  return <LibraryStateProvider key={key} entryMode={entryMode}><OneShelfRoot><AppFrame><Routes>{appRoutes()}</Routes></AppFrame></OneShelfRoot></LibraryStateProvider>;
}

// The one-shelf app (plan 3.1): the home screen (shelf, search, scan, library
// pop-up and side panel), the book page, the side panel's pages and the
// account screens. Old addresses redirect (plan Phase 12): Search, Libraries
// and Settings are overlays on the shelf now. The older full account settings
// stay reachable at /app/settings/account/more.
// Called as a function (not rendered as a component) so <Routes> sees the
// <Route> elements directly.
function appRoutes() {
  return <>
    <Route path="/select/:slug" element={<SelectLibraryLink />} />
    <Route path="/select" element={<SelectLibraryLink />} />
    <Route path="/app" element={<Navigate to="/app/shelf" replace />} />
    <Route path="/app/shelf" element={<HomeScreen />} />
    <Route path="/app/search" element={<SearchRedirect />} />
    <Route path="/app/libraries" element={<LibrariesRedirect />} />
    <Route path="/app/settings" element={<SettingsRedirect />} />
    <Route path="/app/settings/account" element={<AccountSettingsSmall />}/>
    <Route path="/app/settings/account/more" element={<AccountSettingsPage />} />
    <Route path="/app/account/sign-in" element={<AccountEntryGate key="signin"><LogInPage /></AccountEntryGate>}/>
    <Route path="/app/account/sign-up" element={<AccountEntryGate key="signup" needsEmail><CreateAccountPage /></AccountEntryGate>}/>
    <Route path="/app/account/verify" element={<AccountEntryGate key="verify"><VerifyEmailPage /></AccountEntryGate>}/>
    <Route path="/app/account/forgot-password" element={<AccountEntryGate key="forgot" needsEmail><ResetRequestPage /></AccountEntryGate>}/>
    <Route path="/app/account/reset-password" element={<AccountEntryGate key="reset"><NewPasswordPage /></AccountEntryGate>}/>
    <Route path="/app/account/email-change" element={<EmailChangePage/>}/>
    <Route path="/app/account/return" element={<ProviderReturnPage/>}/>
    <Route path="/app/account/complete-profile" element={<CompleteProfilePage/>}/>
    <Route path="/app/account/deletion" element={<DeletionDonePage />}/>
    <Route path="/app/account/import" element={<ImportPage/>}/>
    <Route path="/app/books/:bookKey" element={<ShelfBookPage />} />
    <Route path="/app/read/:contentKey" element={<ContentDetailPage />} />
    <Route path="/app/report" element={<ReportProblemPage />} />
    <Route path="/app/privacy" element={<PrivacyPage />} />
    <Route path="/app/terms" element={<TermsPage />} />
    <Route path="/app/about" element={<AboutPage />} />
    <Route path="/app/admin" element={<Suspense fallback={<p role="status">Loading…</p>}><AdminPage /></Suspense>} />
    <Route path="/find" element={<Navigate to="/app/shelf" replace />} />
    <Route path="/privacy" element={<Navigate to="/app/privacy" replace />} />
    <Route path="/login" element={<NativeAppNotice />} />
    <Route path="/connect" element={<NativeAppNotice />} />
    <Route path="*" element={<NotFoundPage />} />
  </>;
}
