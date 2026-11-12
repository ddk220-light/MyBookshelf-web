import { createAnonymousApp } from './anonymousApp.js';
import { createAccountMiddleware } from './accounts/middleware.js';
import { createJobMiddleware } from './jobs/middleware.js';
import { createAccountHealthMiddleware } from './jobs/health.js';
import { createCatalogMaintenanceMiddleware } from './catalog-store/cron.js';

// Shared by local and Vercel entry points; account code initializes on demand.
// The catalog store's daily job is separate from the account jobs and uses
// its own database and worker role.
export function createApplication({ accounts = createAccountMiddleware(), jobs = createJobMiddleware(), accountHealth = createAccountHealthMiddleware(),
  catalogMaintenance = createCatalogMaintenanceMiddleware(), ...options } = {}) {
  return createAnonymousApp({ ...options, accounts: (req,res,next) => catalogMaintenance(req,res,() => accountHealth(req,res,() => jobs(req,res,() => accounts(req,res,next)))) });
}
