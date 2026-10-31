import { cachedTask, getText, DEFAULT_TIMEOUT_MS } from './http.js';

function providerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function aspenSearchUrl(baseUrl, isbn) {
  const url = new URL('/Search/Results', baseUrl);
  url.searchParams.set('lookfor', isbn);
  url.searchParams.set('searchIndex', 'ISBN');
  return url.toString();
}

// Aspen installs can expose public search pages, but MAIN and CLEVNET place a
// Cloudflare gate in front of all normal server/mobile HTTP clients. Keep the
// adapter deliberately conservative: a gate is an unknown observation, never
// a claim that the library lacks the book.
export async function checkAvailability(library, isbn) {
  if (!isbn) throw providerError('CATALOG_EXACT_ISBN_REQUIRED', 'Aspen availability requires an ISBN');
  if (!library?.baseUrl) throw providerError('CATALOG_CONFIGURATION_REQUIRED', 'Aspen configuration is incomplete');
  const deadlineAt = Date.now() + DEFAULT_TIMEOUT_MS;
  const key = `availability:aspen:${library.id}:${isbn}`;
  return cachedTask(key, async () => {
    const response = await getText(aspenSearchUrl(library.baseUrl, isbn), {
      deadlineAt,
      maxResponseBytes: 1024 * 1024,
    });
    if (response.status === 401 || response.status === 403) {
      throw providerError('CATALOG_PROVIDER_BLOCKED', 'Aspen rejected the public server request');
    }
    if (!response.ok) throw providerError('CATALOG_UNAVAILABLE', `Aspen returned HTTP ${response.status}`);
    // This integration intentionally does not parse an HTML search result into
    // circulation facts. Until an install has a captured, verified fixture,
    // markup changes must stay an unknown result rather than become a false
    // availability claim.
    throw providerError('CATALOG_UNRECOGNIZED', 'Aspen result markup is not yet verified for this library');
  }, { deadlineAt, shouldCache: () => false });
}
