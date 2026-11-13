import {lazy,Suspense,useLayoutEffect,useRef} from 'react';
import { Link, Navigate, Route, Routes,useLocation,useNavigate } from 'react-router-dom';
import {AccountSessionProvider,useAccountSession} from './auth/AccountSessionProvider';
import {LinkTokenProvider} from './auth/LinkTokenProvider';
import {RecentAuthProvider} from './auth/RecentAuthProvider';
import {DeletionReceiptProvider} from './auth/DeletionReceiptProvider';
import {DeletionStatusPage} from './ui/account/DeletionStatusPage';
import {safeAccountReturn} from './auth/accountClient';
import {SignInPage,VerifyPage,RecoveryPage,ImportPage,EmailChangePage,ProviderReturnPage,CompleteProfilePage} from './ui/account/AccountPages';
import {AccountSettingsPage} from './ui/account/AccountSettingsPage';
import {AccountEntryGate} from './ui/account/AccountEntryGate';
import { LibraryStateProvider } from './context';
import { LibrariesPage } from './ui/library/LibrariesPage';
import { AppFrame } from './ui/AppFrame';
import { SettingsPage } from './ui/settings/SettingsPage';
import { ShelfPage } from './ui/shelf/ShelfPage';
import { BookPage } from './ui/book/BookPage';
import { ScanPage } from './ui/scan/ScanPage';
import { uiMessages as m } from './uiMessages';
import { SelectLibraryPage } from './ui/library/SelectLibraryPage';
import { ContentDetailPage } from './ui/content/ContentDetailPage';
import { oneShelfEnabled } from './featureFlags';
import { OneShelfRoot } from './OneShelfRoot';
import { HomeScreen } from './ui/home/HomeScreen';
import { ShelfBookPage } from './ui/book/ShelfBookPage';
import { SelectLibraryLink } from './ui/library/SelectLibraryLink';
import { OneShelfContext } from './featureFlags';
import { AccountSettingsSmall } from './ui/account/AccountSettingsSmall';
import { CreateAccountPage, DeletionDonePage, LogInPage, NewPasswordPage, ResetRequestPage, VerifyEmailPage } from './ui/account/OneShelfAccountPages';
import { ReportProblemPage } from './ui/panel/ReportProblemPage';
import { AboutPage, PrivacyPage, TermsPage } from './ui/panel/PolicyPages';

export { LibrariesPage } from './ui/library/LibrariesPage';

// The owner-only admin view (plan section 6): its own chunk, linked from no
// screen, noindex. The server answers 404 to anyone but the owner.
const AdminPage = lazy(() => import('./ui/admin/AdminPage'));

function NativeAppNotice() {
  return <section className="page-section prose"><h1>{m.findBooks}</h1><p>No sign-in needed.</p><Link className="button-link" to="/app/search">{m.searchButton}</Link></section>;
}

function NotFoundPage() {
  return <section className="page-section prose"><h1>Page not found</h1><Link className="button-link" to="/app/search">{m.backToSearch}</Link></section>;
}

export function AnonymousWebApp({oneShelf=oneShelfEnabled()}:{oneShelf?:boolean}={}) {
  return <OneShelfContext.Provider value={oneShelf}><AccountSessionProvider disabledMeansGuest={oneShelf}><DeletionReceiptProvider><RecentAuthProvider><LinkTokenProvider><IdentityApp oneShelf={oneShelf}/></LinkTokenProvider></RecentAuthProvider></DeletionReceiptProvider></AccountSessionProvider></OneShelfContext.Provider>;
}
function IdentityApp({oneShelf}:{oneShelf:boolean}){
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
  // VITE_ONE_SHELF off (the default): exactly today's tree. On: the one-shelf
  // tree: the new home screen and side panel, other screens as today until
  // their phases replace them.
  if(oneShelf)return <LibraryStateProvider key={key} entryMode={entryMode} oneShelf><OneShelfRoot><AppFrame oneShelf><Routes>{currentRoutes(oneShelfScreens)}</Routes></AppFrame></OneShelfRoot></LibraryStateProvider>;
  return <LibraryStateProvider key={key} entryMode={entryMode}><AppFrame><Routes>{currentRoutes()}</Routes></AppFrame></LibraryStateProvider>;
}

// The one-shelf home replaces the shelf; Settings is now the side panel on it.
// The book page is rewritten, and a library link chooses its library silently.
// The panel's pages (plan 3.1, Phase 9): Report a problem, Privacy, Terms,
// About and the small Account settings; the account forms in the
// AccountStates layout. The older full account settings stay reachable at
// /app/settings/account/more.
const oneShelfScreens: Screens = {
  shelf: <HomeScreen />,
  settings: <Navigate to="/app/shelf" replace state={{ overlay: 'panel' }} />,
  book: <ShelfBookPage />,
  select: <SelectLibraryLink />,
  accountSettings: <AccountSettingsSmall />,
  signIn: <AccountEntryGate key="signin"><LogInPage /></AccountEntryGate>,
  signUp: <AccountEntryGate key="signup" needsEmail><CreateAccountPage /></AccountEntryGate>,
  verify: <AccountEntryGate key="verify"><VerifyEmailPage /></AccountEntryGate>,
  forgot: <AccountEntryGate key="forgot" needsEmail><ResetRequestPage /></AccountEntryGate>,
  reset: <AccountEntryGate key="reset"><NewPasswordPage /></AccountEntryGate>,
  deletion: <DeletionDonePage />,
  extra: <>
    <Route path="/app/settings/account/more" element={<AccountSettingsPage />} />
    <Route path="/app/report" element={<ReportProblemPage />} />
    <Route path="/app/privacy" element={<PrivacyPage />} />
    <Route path="/app/terms" element={<TermsPage />} />
    <Route path="/app/about" element={<AboutPage />} />
  </>,
};
type Screens = { shelf?: JSX.Element; settings?: JSX.Element; book?: JSX.Element; select?: JSX.Element; accountSettings?: JSX.Element;
  signIn?: JSX.Element; signUp?: JSX.Element; verify?: JSX.Element; forgot?: JSX.Element; reset?: JSX.Element; deletion?: JSX.Element; extra?: JSX.Element };

// Today's route table. Called as a function (not rendered as a component) so
// <Routes> sees the <Route> elements directly. The flag-on tree swaps in its
// own shelf and settings screens; everything else is shared.
function currentRoutes(screens: Screens = {}) {
  return <>
    <Route path="/app/libraries" element={<LibrariesPage />} />
    <Route path="/select/:slug" element={screens.select ?? <SelectLibraryPage />} />
    <Route path="/select" element={screens.select ?? <SelectLibraryPage />} />
    <Route path="/app" element={<Navigate to="/app/shelf" replace />} />
    <Route path="/app/shelf" element={screens.shelf ?? <ShelfPage />} />
    <Route path="/app/search" element={<ScanPage />} />
    <Route path="/app/settings" element={screens.settings ?? <SettingsPage />} />
    <Route path="/app/settings/account" element={screens.accountSettings ?? <AccountSettingsPage/>}/>
    <Route path="/app/account/sign-in" element={screens.signIn ?? <AccountEntryGate key="signin"><SignInPage/></AccountEntryGate>}/>
    <Route path="/app/account/sign-up" element={screens.signUp ?? <AccountEntryGate key="signup" needsEmail allowProviders><SignInPage signup/></AccountEntryGate>}/>
    <Route path="/app/account/verify" element={screens.verify ?? <AccountEntryGate key="verify"><VerifyPage/></AccountEntryGate>}/>
    <Route path="/app/account/forgot-password" element={screens.forgot ?? <AccountEntryGate key="forgot" needsEmail><RecoveryPage/></AccountEntryGate>}/>
    <Route path="/app/account/reset-password" element={screens.reset ?? <AccountEntryGate key="reset"><RecoveryPage reset/></AccountEntryGate>}/>
    <Route path="/app/account/email-change" element={<EmailChangePage/>}/>
    <Route path="/app/account/return" element={<ProviderReturnPage/>}/>
    <Route path="/app/account/complete-profile" element={<CompleteProfilePage/>}/>
    <Route path="/app/account/deletion" element={screens.deletion ?? <DeletionStatusPage/>}/>
    <Route path="/app/account/import" element={<ImportPage/>}/>
    <Route path="/app/books/:bookKey" element={screens.book ?? <BookPage />} />
    <Route path="/app/read/:contentKey" element={<ContentDetailPage />} />
    <Route path="/app/admin" element={<Suspense fallback={<p role="status">Loading…</p>}><AdminPage /></Suspense>} />
    <Route path="/find" element={<Navigate to="/app/search" replace />} />
    <Route path="/privacy" element={<Navigate to="/settings#privacy" replace />} />
    {screens.extra}
    <Route path="/login" element={<NativeAppNotice />} />
    <Route path="/connect" element={<NativeAppNotice />} />
    <Route path="*" element={<NotFoundPage />} />
  </>;
}
