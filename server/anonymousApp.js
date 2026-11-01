import express from 'express';
import cors from 'cors';
import path from 'path';
import { HTML_SECURITY_POLICY } from '../shared/security-policy.mjs';

import { createPublicV2Router } from './public-v2/router.js';

export const LEGACY_API_RETIRED = Object.freeze({
  error: Object.freeze({
    code: 'LEGACY_API_RETIRED',
    message: 'This API has been retired. Use the anonymous public catalog endpoints instead.',
  }),
});

const PUBLIC_API_NOT_FOUND = Object.freeze({
  error: Object.freeze({
    code: 'NOT_FOUND',
    message: 'This public catalog endpoint does not exist.',
  }),
});

// Open Library can redirect older covers through Internet Archive's ZIP image service.
export { HTML_SECURITY_POLICY } from '../shared/security-policy.mjs';

function legacyCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

export function expireLegacyCookies(res) {
  const options = legacyCookieOptions();
  res.clearCookie('mb_session', options);
  res.clearCookie('mb_key', options);
}

function retireLegacySurface(req, res) {
  // Deliberately do not parse Cookie headers or reach auth/database code here.
  res.status(410).json(LEGACY_API_RETIRED);
}

function isDocumentNavigation(req) {
  return req.method === 'GET' && req.accepts(['html']) === 'html';
}

function setStaticHeaders(res, filePath) {
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (filePath.endsWith('index.html')) {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Security-Policy', HTML_SECURITY_POLICY);
  } else {
    res.setHeader('Cache-Control', 'public, max-age=604800');
  }
}

export function createAnonymousApp({ clientDist, publicRouter = createPublicV2Router(), accounts } = {}) {
  const app = express();
  const publicCorsOrigin = process.env.NODE_ENV === 'production' ? false : true;

  app.set('trust proxy', 1);

  // This is the entire public API allowlist. It executes before any retired
  // path and is intentionally isolated from cookie/auth/database middleware.
  app.use('/api/v2', (req, res, next) => { res.setHeader('X-Robots-Tag', 'noindex'); next(); },
    cors({ credentials: false, origin: publicCorsOrigin }),
    express.json({ limit: '10kb' }),
    publicRouter,
    (req, res) => res.status(404).json(PUBLIC_API_NOT_FOUND),
    (error, req, res, next) => {
      if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large') {
        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'The request is invalid.' } });
      }
      return next(error);
    },
  );

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  if (accounts) app.use(accounts);

  // All pre-anonymous APIs and legacy image uploads are deliberately inert.
  // These handlers are mounted before static files and never parse cookies.
  app.all('/api', retireLegacySurface);
  app.all('/api/*', retireLegacySurface);
  app.all('/uploads', retireLegacySurface);
  app.all('/uploads/*', retireLegacySurface);

  // Clear cookies issued by the former account site without clearing the
  // anonymous selection/recent-book record in localStorage. This runs only
  // for an HTML navigation after every API path has returned, so v2 responses
  // and immutable static assets never set a cookie.
  app.use((req, res, next) => {
    if (isDocumentNavigation(req)) expireLegacyCookies(res);
    next();
  });

  if (clientDist) {
    for (const page of ['privacy', 'support']) {
      app.get(`/${page}`, (req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Content-Security-Policy', HTML_SECURITY_POLICY);
        res.sendFile(path.join(clientDist, `${page}.html`));
      });
    }
    app.use(express.static(clientDist, { extensions: ['html'], index: 'index.html', setHeaders: setStaticHeaders }));
    app.get(['/app', '/app/*', '/select/*'], (req, res) => {
      res.setHeader('X-Robots-Tag', 'noindex, follow');
      res.setHeader('Content-Security-Policy', HTML_SECURITY_POLICY);
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDist, 'app/index.html'));
    });
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Content-Security-Policy', HTML_SECURITY_POLICY);
      res.status(404).sendFile(path.join(clientDist, '404.html'));
    });
  }

  return app;
}
