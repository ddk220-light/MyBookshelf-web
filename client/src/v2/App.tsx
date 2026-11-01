import { Link, Navigate, Route, Routes } from 'react-router-dom';
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

export { LibrariesPage } from './ui/library/LibrariesPage';

function NativeAppNotice() {
  return <section className="page-section prose"><h1>{m.findBooks}</h1><p>No sign-in needed.</p><Link className="button-link" to="/app/search">{m.searchButton}</Link></section>;
}

function NotFoundPage() {
  return <section className="page-section prose"><h1>Page not found</h1><Link className="button-link" to="/app/search">{m.backToSearch}</Link></section>;
}

export function AnonymousWebApp() {
  return <LibraryStateProvider><AppFrame><Routes>
    <Route path="/app/libraries" element={<LibrariesPage />} />
    <Route path="/select/:slug" element={<SelectLibraryPage />} />
    <Route path="/select" element={<SelectLibraryPage />} />
    <Route path="/app" element={<Navigate to="/app/shelf" replace />} />
    <Route path="/app/shelf" element={<ShelfPage />} />
    <Route path="/app/search" element={<ScanPage />} />
    <Route path="/app/settings" element={<SettingsPage />} />
    <Route path="/app/books/:bookKey" element={<BookPage />} />
    <Route path="/app/read/:contentKey" element={<ContentDetailPage />} />
    <Route path="/find" element={<Navigate to="/app/search" replace />} />
    <Route path="/privacy" element={<Navigate to="/settings#privacy" replace />} />
    <Route path="/login" element={<NativeAppNotice />} />
    <Route path="/connect" element={<NativeAppNotice />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes></AppFrame></LibraryStateProvider>;
}
