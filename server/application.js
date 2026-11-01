import { createAnonymousApp } from './anonymousApp.js';
import { createAccountMiddleware } from './accounts/middleware.js';

// Shared by local and Vercel entry points; account code initializes on demand.
export function createApplication({ accounts = createAccountMiddleware(), ...options } = {}) {
  return createAnonymousApp({ ...options, accounts });
}
