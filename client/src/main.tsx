import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AnonymousWebApp } from './v2/App';
import { clearLegacyBrowserState } from './v2/legacyCleanup';
import { startAnalytics } from './v2/analytics';
import './v2/styles.css';
import './v2/discovery.css';
import './v2/desktop.css';
import './v2/reading-room.css';
import './v2/reader.css';
import './v2/reader-desktop.css';
import './v2/ui/account/account.css';

// The retired account site could have left only an auth flash, a same-origin
// service worker, or its caches. This migration does not touch anonymous state.
void clearLegacyBrowserState();
// Cookieless page visits, only when the build turns them on (VITE_ANALYTICS_ENABLED);
// with it off the loader is not even in the bundle.
if (import.meta.env.VITE_ANALYTICS_ENABLED === 'true') startAnalytics();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* URL-backed controls update synchronously; BookLink owns the optional visual transition. */}
    <BrowserRouter useTransitions={false}>
      <AnonymousWebApp />
    </BrowserRouter>
  </React.StrictMode>,
);
