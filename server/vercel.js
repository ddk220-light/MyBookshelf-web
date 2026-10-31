import express from 'express';
import { createAnonymousApp } from './anonymousApp.js';

// Vercel owns the listener and serves the Vite build through its CDN.
// Only the current public API is reachable from this entrypoint.
const app = express();
app.use(createAnonymousApp());

export default app;
