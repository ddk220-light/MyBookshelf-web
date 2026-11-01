import {useLayoutEffect,useRef} from 'react';
import { Link, Navigate, Route, Routes,useLocation,useNavigate } from 'react-router-dom';
import {AccountSessionProvider,useAccountSession} from './auth/AccountSessionProvider';
import {LinkTokenProvider} from './auth/LinkTokenProvider';
import {SignInPage,VerifyPage,RecoveryPage,ImportPage} from './ui/account/AccountPages';
import './ui/account/account.css';
import {AccountSettingsPage} from './ui/account/AccountSettingsPage';
import { LibraryStateProvider } from './context';
import { LibrariesPage } from './ui/library/LibrariesPage';
import { AppFrame } from './ui/AppFrame';
import { SettingsPage } from './ui/settings/SettingsPage';
import { ShelfPage } from './ui/shelf/ShelfPage';
import { BookPage } from './ui/book/BookPage';
import { ScanPage } from './ui/scan/ScanPage';
import { uiMessages as m } from './uiMessages';
import { SelectLibraryPage } from './ui/library/SelectLibraryPage';

export { LibrariesPage } from './ui/library/LibrariesPage';

function NativeAppNotice() {
  return <section className="page-section prose"><h1>{m.findBooks}</h1><p>No sign-in needed.</p><Link className="button-link" to="/app/search">{m.searchButton}</Link></section>;
}

function NotFoundPage() {
  return <section className="page-section prose"><h1>Page not found</h1><Link className="button-link" to="/app/search">{m.backToSearch}</Link></section>;
}

export function AnonymousWebApp() {
  return <AccountSessionProvider><LinkTokenProvider><IdentityApp/></LinkTokenProvider></AccountSessionProvider>;
}
function IdentityApp(){
  const {session}=useAccountSession(),navigate=useNavigate(),location=useLocation();
  const prior=useRef<string|null>(null),current=session.status==='authenticated'?session.user?.id||null:null;
  const redirect=prior.current!==null&&prior.current!==current;
  useLayoutEffect(()=>{if(redirect)navigate('/app/shelf',{replace:true,state:null});prior.current=current;},[current,redirect,navigate,location.pathname]);
  if(redirect)return <p role="status">Updating your account…</p>;
  const entryMode=/^\/app\/account\/(sign-in|sign-up|verify|forgot-password|reset-password)$/.test(location.pathname);
  return <LibraryStateProvider key={entryMode?'account-entry':session.epoch} entryMode={entryMode}><AppFrame><Routes>
    <Route path="/app/libraries" element={<LibrariesPage />} />
    <Route path="/select/:slug" element={<SelectLibraryPage />} />
    <Route path="/select" element={<SelectLibraryPage />} />
    <Route path="/app" element={<Navigate to="/app/shelf" replace />} />
    <Route path="/app/shelf" element={<ShelfPage />} />
    <Route path="/app/search" element={<ScanPage />} />
    <Route path="/app/settings" element={<SettingsPage />} />
    <Route path="/app/settings/account" element={<AccountSettingsPage/>}/>
    <Route path="/app/account/sign-in" element={<SignInPage key="signin"/>}/>
    <Route path="/app/account/sign-up" element={<SignInPage key="signup" signup/>}/>
    <Route path="/app/account/verify" element={<VerifyPage/>}/>
    <Route path="/app/account/forgot-password" element={<RecoveryPage key="forgot"/>}/>
    <Route path="/app/account/reset-password" element={<RecoveryPage key="reset" reset/>}/>
    <Route path="/app/account/import" element={<ImportPage/>}/>
    <Route path="/app/books/:bookKey" element={<BookPage />} />
    <Route path="/find" element={<Navigate to="/app/search" replace />} />
    <Route path="/privacy" element={<Navigate to="/settings#privacy" replace />} />
    <Route path="/login" element={<NativeAppNotice />} />
    <Route path="/connect" element={<NativeAppNotice />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes></AppFrame></LibraryStateProvider>;
}
