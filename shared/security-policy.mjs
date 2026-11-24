// Shared by server headers and Vite preview without importing server dependencies.
// vercel.json holds the same policy. The Google hosts are Google's list for
// Analytics without advertising features (shared/google-tag.mjs).
export const HTML_SECURITY_POLICY = "default-src 'self'; script-src 'self' https://www.googletagmanager.com; style-src 'self'; img-src 'self' https://books.google.com https://books.googleusercontent.com https://covers.openlibrary.org https://archive.org/download/ https://*.us.archive.org/view_archive.php https://www.googletagmanager.com https://*.google-analytics.com data:; connect-src 'self' https://www.googletagmanager.com https://*.google-analytics.com https://*.google.com; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
