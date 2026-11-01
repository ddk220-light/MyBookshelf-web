import { readAccountConfig } from './config.js';

const RESERVED_AUTH = /^\/api\/auth\/(?:ok|get-session|sign-up\/email|sign-in\/(?:email|social)|sign-out|verify-email|send-verification-email|request-password-reset|reset-password|callback\/[^/]+|change-password|change-email|link-social|unlink-account|delete-user|list-sessions|revoke-session|revoke-sessions|revoke-other-sessions|update-user|set-password)(?:\/|$)/;
const unavailable = (res) => res.status(503).json({ error: { code: 'ACCOUNT_UNAVAILABLE', message: 'Accounts are temporarily unavailable. You can continue browsing.' } });

// Lazy initialization is scoped to the app, not to public catalog requests.
export function createAccountMiddleware({ env = process.env, initialize = async (config) => {
  const { createAccountService } = await import('./service.js');
  return createAccountService(config);
}, retryAfterMs = 5000 } = {}) {
  let service, pending, retryAt = 0;
  return async function accounts(req, res, next) {
    const path = req.path;
    if (!(path === '/api/account' || path.startsWith('/api/account/') || RESERVED_AUTH.test(path))) return next();
    res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' });
    try {
      const config = readAccountConfig(env);
      if (!config.enabled) return unavailable(res);
      // Auth protocol and sensitive routes stay closed until their individual
      // policy/mail/lifecycle stories are implemented. /get-session returns raw
      // library rows, so browsers must use the narrow /api/account/session facade.
      if (!['/api/auth/ok', '/api/account/session'].includes(path)) return unavailable(res);
      if (req.method !== 'GET') return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET.' } });
      const origin = req.get('Origin');
      if (origin && origin !== config.baseURL) return res.status(403).json({ error: { code: 'ORIGIN_REJECTED', message: 'The request origin is not allowed.' } });
      if (!service) {
        if (Date.now() < retryAt) return unavailable(res);
        pending ??= initialize(config).then((value) => { service = value; return value; }).catch(() => {
          retryAt = Date.now() + retryAfterMs; throw new Error('Account initialization failed.');
        }).finally(() => { pending = undefined; });
        await pending;
      }
      if (path === '/api/auth/ok') return await service.handleAuth(req, res);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
      return res.json(await service.session(headers, (cookie) => res.append('Set-Cookie', cookie)));
    } catch { return unavailable(res); }
  };
}
