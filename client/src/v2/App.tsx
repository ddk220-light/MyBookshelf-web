import {useLayoutEffect,useRef} from 'react';
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

export { LibrariesPage } from './ui/library/LibrariesPage';

function NativeAppNotice() {
  return <section className="page-section prose"><h1>{m.findBooks}</h1><p>No sign-in needed.</p><Link className="button-link" to="/app/search">{m.searchButton}</Link></section>;
}

function NotFoundPage() {
  return <section className="page-section prose"><h1>Page not found</h1><Link className="button-link" to="/app/search">{m.backToSearch}</Link></section>;
}

export function AnonymousWebApp({oneShelf=oneShelfEnabled()}:{oneShelf?:boolean}={}) {
  return <AccountSessionProvider><DeletionReceiptProvider><RecentAuthProvider><LinkTokenProvider><IdentityApp oneShelf={oneShelf}/></LinkTokenProvider></RecentAuthProvider></DeletionReceiptProvider></AccountSessionProvider>;
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
  // tree, which for now serves the same routes over the new browser state.
  if(oneShelf)return <LibraryStateProvider key={key} entryMode={entryMode} oneShelf><OneShelfRoot><AppFrame><Routes>{currentRoutes()}</Routes></AppFrame></OneShelfRoot></LibraryStateProvider>;
  return <LibraryStateProvider key={key} entryMode={entryMode}><AppFrame><Routes>{currentRoutes()}</Routes></AppFrame></LibraryStateProvider>;
}

// Today's route table. Called as a function (not rendered as a component) so
// <Routes> sees the <Route> elements directly.
function currentRoutes() {
  return <>
    <Route path="/app/libraries" element={<LibrariesPage />} />
    <Route path="/select/:slug" element={<SelectLibraryPage />} />
    <Route path="/select" element={<SelectLibraryPage />} />
    <Route path="/app" element={<Navigate to="/app/shelf" replace />} />
    <Route path="/app/shelf" element={<ShelfPage />} />
    <Route path="/app/search" element={<ScanPage />} />
    <Route path="/app/settings" element={<SettingsPage />} />
    <Route path="/app/settings/account" element={<AccountSettingsPage/>}/>
    <Route path="/app/account/sign-in" element={<AccountEntryGate key="signin"><SignInPage/></AccountEntryGate>}/>
    <Route path="/app/account/sign-up" element={<AccountEntryGate key="signup" needsEmail allowProviders><SignInPage signup/></AccountEntryGate>}/>
    <Route path="/app/account/verify" element={<AccountEntryGate key="verify"><VerifyPage/></AccountEntryGate>}/>
    <Route path="/app/account/forgot-password" element={<AccountEntryGate key="forgot" needsEmail><RecoveryPage/></AccountEntryGate>}/>
    <Route path="/app/account/reset-password" element={<AccountEntryGate key="reset"><RecoveryPage reset/></AccountEntryGate>}/>
    <Route path="/app/account/email-change" element={<EmailChangePage/>}/>
    <Route path="/app/account/return" element={<ProviderReturnPage/>}/>
    <Route path="/app/account/complete-profile" element={<CompleteProfilePage/>}/>
    <Route path="/app/account/deletion" element={<DeletionStatusPage/>}/>
    <Route path="/app/account/import" element={<ImportPage/>}/>
    <Route path="/app/books/:bookKey" element={<BookPage />} />
    <Route path="/app/read/:contentKey" element={<ContentDetailPage />} />
    <Route path="/find" element={<Navigate to="/app/search" replace />} />
    <Route path="/privacy" element={<Navigate to="/settings#privacy" replace />} />
    <Route path="/login" element={<NativeAppNotice />} />
    <Route path="/connect" element={<NativeAppNotice />} />
    <Route path="*" element={<NotFoundPage />} />
  </>;
}
