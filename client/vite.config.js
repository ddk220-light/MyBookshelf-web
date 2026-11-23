import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { HTML_SECURITY_POLICY } from '../shared/security-policy.mjs';
import { SOURCE_REPOSITORY_URL } from '../shared/source-repository.mjs';
import { policyTextPlugin } from '../shared/policy-effective-date.mjs';

// Short commit SHA sent with problem reports: Vercel's build variable, else
// the local checkout, else empty (reports then carry no version).
function buildVersion() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha && /^[0-9a-f]{7,40}$/i.test(sha)) return sha.slice(0, 7);
  try {
    const local = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /^[0-9a-f]{7}$/.test(local) ? local : '';
  } catch { return ''; }
}

export default defineConfig({
  appType: 'mpa',
  // policyTextPlugin: Privacy and Terms carry their committed effective date
  // in the bundle (shared/policy-effective-date.mjs), never a placeholder.
  plugins: [react(), policyTextPlugin(), {
    name: 'public-pages-preview',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (/^\/(app|select|find)(\/|\?|$)/.test(req.url || '')) req.url = '/index.html';
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url || '/', 'http://localhost').pathname;
        // As vercel.json: the shelf's old addresses forward to the root, without the query.
        if (/^\/app(\/shelf)?\/?$/.test(path)) {
          res.statusCode = 308; res.setHeader('Location', '/'); res.end(); return;
        }
        if (/^\/(app|select|find)(\/|$)/.test(path)) {
          res.setHeader('X-Robots-Tag', 'noindex, follow');
          req.url = '/app/index.html';
          return next();
        }
        const file = resolve('dist', '.' + path + (path === '/' ? 'index.html' : '.html'));
        if (existsSync(file) && !path.endsWith('.html')) req.url = path === '/' ? '/index.html' : path + '.html';
        else if (!existsSync(resolve('dist', '.' + path))) {
          res.statusCode = 404; res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Content-Security-Policy', HTML_SECURITY_POLICY);
          res.end(readFileSync(resolve('dist/404.html'))); return;
        }
        res.setHeader('Content-Security-Policy', HTML_SECURITY_POLICY);
        next();
      });
    },
  }],
  define: {
    // Protected previews need Vercel's same-origin access cookie. Production
    // still sends no credentials to the anonymous catalog API.
    'import.meta.env.VITE_SOURCE_URL': JSON.stringify(SOURCE_REPOSITORY_URL),
    'import.meta.env.VITE_DEPLOYMENT_ENV': JSON.stringify(process.env.VERCEL_ENV || 'development'),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(buildVersion()),
  },
  // Only the current native-app policy/support assets are published. The former
  // account site's public directory remains excluded from the anonymous app.
  publicDir: 'public-app',
  server: {
    port: 5173,
    host: '0.0.0.0', // bind LAN so phones can hit this dev box
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
