import fs from 'node:fs';

const publicHttpOrigins = new Map(JSON.parse(fs.readFileSync(
  new URL('./public-catalog-http-origins.json', import.meta.url), 'utf8',
)).map(({ libraryId, origin }) => [libraryId, origin]));

// A few public catalogs publish only HTTP. These reviewed, exact ID/origin
// pairs are exceptions for anonymous bibliographic reads, never patron access.
// Callers still bound paths, response sizes, deadlines and redirect targets.
export function isReviewedPublicHttpOrigin(libraryId, value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && !url.username && !url.password
      && url.origin === publicHttpOrigins.get(libraryId);
  } catch {
    return false;
  }
}

// The adapters that read a reviewed HTTP origin (koha.js, tlc.js).
const HTTP_PLATFORMS = new Set(['koha', 'tlc']);

export function publicCatalogOrigin(library) {
  try {
    const url = new URL(library?.baseUrl);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.protocol === 'https:' || (HTTP_PLATFORMS.has(library.platform) && isReviewedPublicHttpOrigin(library.id, url)) ? url : null;
  } catch {
    return null;
  }
}
