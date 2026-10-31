// This script only runs on the public homepage. Never rewrite the visitor's shelf.
if (window.location.pathname === '/') {
  try {
    const raw = localStorage.getItem('mybookshelf.anonymous-web.v1');
    const state = raw && raw.length < 2000000 ? JSON.parse(raw) : null;
    if (state?.version === 1 && Array.isArray(state.savedBooks) && Array.isArray(state.recentBooks)
      && state.savedBooks.every(book => typeof book?.bookKey === 'string' && typeof book?.title === 'string' && Array.isArray(book.authors))
      && ((typeof state.selectedLibraryId === 'string' && state.selectedLibraryId.length > 0 && state.selectedLibraryId.length <= 160) || state.savedBooks.length > 0)) {
      window.location.replace('/app/shelf');
    }
  } catch { /* Storage can be unavailable or damaged; keep the landing page readable. */ }
}
