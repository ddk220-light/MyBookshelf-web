import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HTML_SECURITY_POLICY } from '../shared/html-security-policy.mjs';

export default defineConfig({
  appType: 'mpa',
  plugins: [react(), {
    name: 'public-pages-preview',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (/^\/(app|select)(\/|\?|$)/.test(req.url || '')) req.url = '/index.html';
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url || '/', 'http://localhost').pathname;
        if (/^\/(app|select)(\/|$)/.test(path)) {
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
    'import.meta.env.VITE_SOURCE_URL': JSON.stringify('https://github.com/ddk220-light/MyBookshelf-web/tree/' + (process.env.VERCEL_GIT_COMMIT_SHA || 'main')),
    'import.meta.env.VITE_DEPLOYMENT_ENV': JSON.stringify(process.env.VERCEL_ENV || 'development'),
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
