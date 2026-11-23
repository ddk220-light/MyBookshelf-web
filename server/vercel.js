import { createApplication } from './application.js';

// Vercel owns the listener; account initialization never blocks public startup.
export default createApplication();
