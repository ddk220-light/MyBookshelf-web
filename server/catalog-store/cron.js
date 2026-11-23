import { createHash, timingSafeEqual } from 'node:crypto';
import { readCatalogStoreConfig } from './config.js';
import { createCatalogPolicy } from './policy.js';

// GET /api/internal/catalog-maintenance: the daily job (plan 4.4), called by
// Vercel Cron with `Authorization: Bearer <CRON_SECRET>`. Runs with the worker
// role (CATALOG_WORKER_DATABASE_URL); never with the runtime or owner role.
// Returns counts only: no text, book keys or database details.
export const CATALOG_MAINTENANCE_PATH = '/api/internal/catalog-maintenance';

const unavailable = res => res.status(503).json({ error: { code: 'MAINTENANCE_UNAVAILABLE', message: 'Catalog maintenance is unavailable.' } });

export function createCatalogMaintenanceMiddleware({ env = process.env, policy = createCatalogPolicy(), connect = null } = {}) {
  let db = null;
  const middleware = async (req, res, next) => {
    if (req.path !== CATALOG_MAINTENANCE_PATH) return next();
    res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' });
    const config = readCatalogStoreConfig(env);
    const provided = req.get('Authorization') || '';
    if (typeof config.cronSecret !== 'string' || config.cronSecret.length < 32
      || !timingSafeEqual(createHash('sha256').update(provided).digest(), createHash('sha256').update(`Bearer ${config.cronSecret}`).digest())) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'This endpoint is private.' } });
    }
    if (req.method !== 'GET') return res.status(405).end();
    if (!config.workerDatabaseUrl) return unavailable(res);
    try {
      const [{ createCatalogDatabase }, { runCatalogMaintenance }] = await Promise.all([import('./pool.js'), import('./maintenance.js')]);
      db ||= connect ? connect(config.workerDatabaseUrl) : createCatalogDatabase(config.workerDatabaseUrl, { max: 1, statementTimeoutMs: 30_000 });
      const role = (await db.query(`SELECT rolsuper, rolbypassrls, pg_has_role(current_user, c.relowner, 'USAGE') AS owns
        FROM pg_roles r CROSS JOIN pg_class c WHERE rolname = current_user AND c.oid = 'holdings_answers'::regclass`)).rows[0];
      // The job must not run as the owner: the worker role only deletes and rolls up.
      if (!role || role.rolsuper || role.rolbypassrls || role.owns) throw new Error('Privileged worker role.');
      return res.json(await runCatalogMaintenance(db, { policy }));
    } catch {
      return unavailable(res);
    }
  };
  middleware.close = async () => { await db?.end?.(); db = null; };
  return middleware;
}
