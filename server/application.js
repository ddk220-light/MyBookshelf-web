import { createAnonymousApp } from './anonymousApp.js';
import { createAccountMiddleware } from './accounts/middleware.js';
import { createJobMiddleware } from './jobs/middleware.js';
import { createAccountHealthMiddleware } from './jobs/health.js';
import { createCatalogMaintenanceMiddleware } from './catalog-store/cron.js';
import { createAdminMiddleware } from './admin/middleware.js';
import { createCatalogStore } from './catalog-store/index.js';

// Shared by local and Vercel entry points; account code initializes on demand.
// The catalog store's daily job is separate from the account jobs and uses
// its own database and worker role. The owner-only admin view (/api/admin/*)
// sits outside /api/v2 next to the account routes: it reads the account
// session to decide who the owner is and the catalog store with its own
// admin role, and never joins the two. The runtime catalog store is created
// once: the public API uses it, and `/api/health` and the admin summary report
// its status word. The daily catalog job also runs the front-page check in
// production (catalog-store/cron.js, frontPageCheck.js).
export function createApplication({ catalogStore = createCatalogStore(), accounts = createAccountMiddleware(), jobs = createJobMiddleware(),
  accountHealth = createAccountHealthMiddleware(), catalogMaintenance = createCatalogMaintenanceMiddleware(),
  admin = createAdminMiddleware({ identify: accounts?.identify, storeStatus: () => catalogStore.status() }), ...options } = {}) {
  return createAnonymousApp({ ...options, catalogStore, accounts: (req,res,next) => admin(req,res,() => catalogMaintenance(req,res,() => accountHealth(req,res,() => jobs(req,res,() => accounts(req,res,next))))) });
}
