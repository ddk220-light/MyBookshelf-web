import { isIP } from 'node:net';

// A few official public OPACs publish HTTP only. This is a reviewed directory
// pin, never a user supplied URL or a fallback after an HTTPS failure.
export function kohaCatalogOrigin(library) {
  try {
    const base = new URL(library?.baseUrl);
    if (base.username || base.password || base.pathname !== '/' || base.search || base.hash) return null;
    if (base.protocol === 'https:') return base;
    if (base.protocol !== 'http:' || library.platform !== 'koha'
        || library.publicCatalogHttpOrigin !== base.origin) return null;
    const host = base.hostname;
    if (isIP(host) === 4) {
      const [a, b, c] = host.split('.').map(Number);
      if (a === 0 || a === 10 || a === 127 || a >= 224
          || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
          || (a === 172 && b >= 16 && b <= 31)
          || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99)))
          || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
          || (a === 203 && b === 0 && c === 113)) return null;
    } else if (isIP(host) || host.includes(':') || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)
        || /\.(?:localhost|local|internal|test|invalid|example)$/i.test(host)) return null;
    return base;
  } catch {
    return null;
  }
}
