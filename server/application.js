import { createAnonymousApp } from './anonymousApp.js';
import { createAccountMiddleware } from './accounts/middleware.js';
import { createJobMiddleware } from './jobs/middleware.js';
import { createAccountHealthMiddleware } from './jobs/health.js';
import { createCatalogMaintenanceMiddleware } from './catalog-store/cron.js';
import { createAdminMiddleware } from './admin/middleware.js';

// Shared by local and Vercel entry points; account code initializes on demand.
// The catalog store's daily job is separate from the account jobs and uses
// its own database and worker role. The owner-only admin view (/api/admin/*)
// sits outside /api/v2 next to the account routes: it reads the account
// session to decide who the owner is and the catalog store with its own
// admin role, and never joins the two.
export function createApplication({ accounts = createAccountMiddleware(), jobs = createJobMiddleware(), accountHealth = createAccountHealthMiddleware(),
  catalogMaintenance = createCatalogMaintenanceMiddleware(), admin = createAdminMiddleware({ identify: accounts?.identify }), ...options } = {}) {
  return createAnonymousApp({ ...options, accounts: (req,res,next) => admin(req,res,() => catalogMaintenance(req,res,() => accountHealth(req,res,() => jobs(req,res,() => accounts(req,res,next))))) });
}
