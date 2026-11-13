import express from 'express';
import { randomUUID } from 'node:crypto';
import { readAdminConfig } from './config.js';
import { readCatalogStoreConfig } from '../catalog-store/config.js';
import { createCatalogPolicy } from '../catalog-store/policy.js';
import { requireMutation, AccountRequestError } from '../accounts/security.js';

// The owner-only admin view's API (plan section 6), outside /api/v2:
//
//   GET   /api/admin/summary
//   GET   /api/admin/library-health        GET /api/admin/library-health.csv
//   PATCH /api/admin/library-health/:libraryId   { acknowledged?, note? }
//   GET   /api/admin/library-requests
//   PATCH /api/admin/library-requests/:key        { status?, note? }
//   GET   /api/admin/problem-reports
//   PATCH /api/admin/problem-reports/:id          { status }
//   GET   /api/admin/usage
//
// Protection: a valid account session (Better Auth) with a verified email
// whose account ID is in ADMIN_ACCOUNT_IDS. Anyone else, signed out, or with
// accounts off gets the same 404 as an unknown path, never 403. Changes also
// need the app's own Origin, a JSON body and the session's CSRF token.
// Responses are private, no-store and noindex. The catalog store is reached
// only with CATALOG_ADMIN_DATABASE_URL (the catalog_admin role); the role is
// checked before the first query.

const NOT_FOUND = Object.freeze({ error: Object.freeze({ code: 'NOT_FOUND', message: 'This page does not exist.' }) });
const STORE_MESSAGES = Object.freeze({
  STORE_NOT_CONFIGURED: 'The catalog store is not configured for the admin view (CATALOG_ADMIN_DATABASE_URL is not set).',
  STORE_UNREACHABLE: 'The catalog store could not be reached.',
  STORE_ROLE_REJECTED: 'The admin connection is not the catalog admin role. Use the catalog_admin connection string.',
});
// A database error code is safe to show the owner (for example 28P01, ECONNREFUSED,
// CATALOG_STORE_TIMEOUT); messages are not, as they can carry hosts or names.
const safeCode = error => (typeof error?.code === 'string' && /^[A-Z0-9_]{2,40}$/.test(error.code) ? error.code : null);

class StoreError extends Error {
  constructor(code, detail = null) { super(code); this.code = code; this.detail = detail; }
}

export const ADMIN_PATH = /^\/api\/admin(?:\/|\.|$)/;

export function createAdminMiddleware({ env = process.env, identify = null, connect = null, policy = createCatalogPolicy(),
  loadQueries = () => import('./queries.js') } = {}) {
  const parser = express.json({ limit: '8kb', strict: true });
  let db = null, dbUrl = null, roleChecked = null;

  async function database(queries) {
    const { databaseUrl } = readAdminConfig(env);
    if (!databaseUrl) throw new StoreError('STORE_NOT_CONFIGURED');
    if (!db || dbUrl !== databaseUrl) {
      await db?.end?.().catch(() => {});
      if (connect) db = connect(databaseUrl);
      else {
        const { createCatalogDatabase } = await import('../catalog-store/pool.js');
        db = createCatalogDatabase(databaseUrl, { max: 2, statementTimeoutMs: 10_000 });
      }
      dbUrl = databaseUrl;
      roleChecked = null;
    }
    roleChecked ||= queries.assertAdminRole(db).catch(error => { roleChecked = null; throw error; });
    try { await roleChecked; } catch (error) {
      if (error?.code === 'STORE_ROLE_REJECTED') throw new StoreError('STORE_ROLE_REJECTED');
      throw new StoreError('STORE_UNREACHABLE', safeCode(error));
    }
    return db;
  }

  async function isAdmin(req, res) {
    const { accountIds } = readAdminConfig(env);
    if (!accountIds.length || typeof identify !== 'function') return null;
    let result;
    try { result = await identify(req, res); } catch { return null; }
    const identity = result?.identity;
    if (result?.status !== 'authenticated' || identity?.status !== 'authenticated' || identity.user?.emailVerified !== true) return null;
    if (!accountIds.includes(String(identity.user.id || '').toLowerCase())) return null;
    return result;
  }

  function route(req) {
    const path = req.path;
    const [, name, rest] = /^\/api\/admin\/([a-z-]+(?:\.csv)?)(?:\/(.+))?$/.exec(path) || [];
    if (!name) return null;
    let param = null;
    if (rest !== undefined) {
      if (rest.includes('/')) return null;
      try { param = decodeURIComponent(rest); } catch { return null; }
    }
    const table = {
      'summary': { GET: 'summary' },
      'library-health': param === null ? { GET: 'health' } : { PATCH: 'acknowledge' },
      'library-health.csv': param === null ? { GET: 'healthCsv' } : {},
      'library-requests': param === null ? { GET: 'requests' } : { PATCH: 'updateRequest' },
      'problem-reports': param === null ? { GET: 'reports' } : { PATCH: 'updateReport' },
      'usage': param === null ? { GET: 'usage' } : {},
    }[name];
    if (!table) return null;
    return { methods: table, action: table[req.method] || null, param };
  }

  const middleware = async function admin(req, res, next) {
    if (!ADMIN_PATH.test(req.path)) return next();
    res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'X-Request-ID': randomUUID() });
    const target = route(req);
    const owner = target ? await isAdmin(req, res) : null;
    if (!owner) return res.status(404).json(NOT_FOUND);
    if (!target.action) return res.status(405).set('Allow', Object.keys(target.methods).join(', ')).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'This method is not supported.' } });
    try {
      if (req.method !== 'GET') {
        requireMutation(req, owner.identity, owner.config);
        await new Promise((resolve, reject) => parser(req, res, error => (error ? reject(error) : resolve())));
      }
      const queries = await loadQueries();
      const store = readCatalogStoreConfig(env);
      const meta = { usageLogEnabled: store.usageLogEnabled };
      if (target.action === 'summary') {
        // The summary always answers, so the page can say plainly when the
        // store is not configured or cannot be reached.
        let state = { state: 'ok' }, value = null;
        try { value = await queries.summary(await database(queries), { policy }); } catch (error) {
          if (!(error instanceof StoreError)) error = new StoreError('STORE_UNREACHABLE', safeCode(error));
          state = { state: error.code === 'STORE_NOT_CONFIGURED' ? 'not_configured' : error.code === 'STORE_ROLE_REJECTED' ? 'wrong_role' : 'unreachable',
            code: error.code, detail: error.detail, message: STORE_MESSAGES[error.code] };
        }
        return res.json({ store: state, ...meta, ...(value || { counts: null, answersByLibrary: [], optedOut: (policy.optedOut?.() || []).map(libraryId => ({ libraryId, name: null })) }) });
      }
      const db = await database(queries);
      let value;
      try {
        if (target.action === 'health') value = { ...meta, ...await queries.libraryHealth(db) };
        else if (target.action === 'healthCsv') {
          const csv = queries.libraryHealthCsv(await queries.libraryHealth(db));
          res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="library-health.csv"' });
          return res.send(csv);
        } else if (target.action === 'requests') value = await queries.listLibraryRequests(db);
        else if (target.action === 'reports') value = await queries.listProblemReports(db);
        else if (target.action === 'usage') value = { ...meta, ...await queries.usage(db) };
        else {
          const update = { acknowledge: queries.acknowledgeLibraryHealth, updateRequest: queries.updateLibraryRequest, updateReport: queries.updateProblemReport }[target.action];
          value = await update(db, target.param, req.body);
          if (!value) return res.status(404).json({ error: { code: 'ROW_NOT_FOUND', message: 'That row no longer exists.' } });
        }
      } catch (error) {
        if (error?.code === 'INVALID_REQUEST') throw error;
        throw new StoreError('STORE_UNREACHABLE', safeCode(error));
      }
      return res.json(value);
    } catch (error) {
      if (res.headersSent) return res.end();
      if (error instanceof StoreError) return res.status(503).json({ error: { code: error.code, detail: error.detail, message: STORE_MESSAGES[error.code] } });
      if (error instanceof AccountRequestError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
      if (error?.code === 'INVALID_REQUEST') return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: error.message } });
      if (error?.type === 'entity.too.large') return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'This request is too large.' } });
      if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Check the submitted fields.' } });
      return res.status(503).json({ error: { code: 'ADMIN_UNAVAILABLE', message: 'The admin view is temporarily unavailable.' } });
    }
  };
  middleware.close = async () => { await db?.end?.(); db = null; };
  return middleware;
}
