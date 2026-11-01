// Shared by the API and Vite's static preview. Keep this module dependency-free
// so a client-only service build never loads the server dependency graph.
export const HTML_SECURITY_POLICY = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://books.google.com https://books.googleusercontent.com https://covers.openlibrary.org https://archive.org/download/ https://*.us.archive.org/view_archive.php https://tile.openstreetmap.org data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
