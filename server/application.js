import { createAnonymousApp } from './anonymousApp.js';
import { createAccountMiddleware } from './accounts/middleware.js';
import { createJobMiddleware } from './jobs/middleware.js';

// Shared by local and Vercel entry points; account code initializes on demand.
export function createApplication({ accounts = createAccountMiddleware(), jobs = createJobMiddleware(), ...options } = {}) {
  return createAnonymousApp({ ...options, accounts: (req,res,next) => jobs(req,res,() => accounts(req,res,next)) });
}
