import { request } from './http.js';
import { attributes, catalogError } from './catalogMarkup.js';

// Each catalog operation gets its own anonymous jar. Cookies, redirects and
// submitted forms never leave the configured, reviewed HTTPS origin.
export class CommunitySession {
  constructor(origin, deadlineAt = Date.now() + 45_000) {
    this.origin = origin;
    this.deadlineAt = deadlineAt;
    this.cookies = new Map();
    this.requests = 0;
  }
  cookie(name) { return this.cookies.get(name)?.value; }
  async read(path, options = {}, redirects = 0) {
    const url = new URL(path, this.origin);
    if (url.origin !== this.origin || url.username || url.password || url.protocol !== 'https:') throw catalogError('Catalog origin changed');
    if (++this.requests > 12 || redirects > 3) throw catalogError('Catalog request limit reached');
    const cookie = [...this.cookies].filter(([, c]) => url.pathname.startsWith(c.path))
      .map(([name, c]) => `${name}=${c.value}`).join('; ');
    const response = await request(url.toString(), { maxResponseBytes: 2 * 1024 * 1024,
      deadlineAt: this.deadlineAt, retries: 0, ...options, redirect: 'manual',
      headers: { Accept: 'text/html, application/json', ...(cookie ? { Cookie: cookie } : {}), ...options.headers } });
    const setCookies = response.headers?.getSetCookie?.()
      || (response.headers?.get?.('set-cookie') || '').split(/,(?=\s*[!#$%&'*+.^_`|~\w-]+=)/);
    for (const line of setCookies) {
      const pieces = line.split(';').map(p => p.trim()), pair = /^([^=\s]+)=(.*)$/.exec(pieces.shift() || '');
      if (!pair) continue;
      const domain = pieces.find(p => /^domain=/i.test(p))?.slice(7).replace(/^\./, '').toLowerCase();
      // A server can legitimately set its parent-domain cookie. Retain it only
      // inside this origin-pinned jar; it is never sent to sibling subdomains.
      if (domain && domain !== url.hostname && !(domain.includes('.') && url.hostname.endsWith(`.${domain}`))) continue;
      const pathValue = pieces.find(p => /^path=/i.test(p))?.slice(5);
      const path = pathValue?.startsWith('/') ? pathValue : url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1);
      this.cookies.set(pair[1], { value: pair[2], path });
    }
    if ([401, 403, 429].includes(response.status)) throw catalogError('Catalog access refused', 'CATALOG_PROVIDER_BLOCKED');
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers?.get?.('location');
      if (!location) throw catalogError('Catalog redirect missing');
      const next = new URL(location, url);
      if (next.origin !== this.origin) throw catalogError('Catalog origin changed');
      // Read-only form workflows use ordinary POST-redirect-GET semantics.
      return this.read(next.toString(), response.status === 307 || response.status === 308 ? options : {}, redirects + 1);
    }
    if (!response.ok) throw catalogError('Catalog request failed', 'CATALOG_UNAVAILABLE');
    if (response.url && new URL(response.url).origin !== this.origin) throw catalogError('Catalog origin changed');
    if (/<title[^>]*>\s*(?:Just a moment|Attention Required)|cf-chl-|challenge-platform/i.test(response.text || '')) throw catalogError('Catalog challenge', 'CATALOG_PROVIDER_BLOCKED');
    return response;
  }
  post(path, fields, headers = {}) {
    return this.read(path, { method: 'POST', body: new URLSearchParams(fields).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers } });
  }
}

export function hiddenFields(html) {
  const fields = {};
  for (const m of html.matchAll(/<input\b([^>]*)>/gi)) {
    const a = attributes(m[1]);
    if (a.name && a.type?.toLowerCase() === 'hidden') fields[a.name] = a.value || '';
  }
  return fields;
}
export function jsonResponse(response) {
  try { return JSON.parse(response.text); } catch { throw catalogError('Unreadable catalog response'); }
}
