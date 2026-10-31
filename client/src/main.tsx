import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AnonymousWebApp } from './v2/App';
import { clearLegacyBrowserState } from './v2/legacyCleanup';
import './v2/styles.css';
import './v2/discovery.css';
import './v2/desktop.css';
import './v2/reading-room.css';
import './v2/reader.css';
import './v2/reader-desktop.css';

// The retired account site could have left only an auth flash, a same-origin
// service worker, or its caches. This migration does not touch anonymous state.
void clearLegacyBrowserState();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* URL-backed controls update synchronously; BookLink owns the optional visual transition. */}
    <BrowserRouter useTransitions={false}>
      <AnonymousWebApp />
    </BrowserRouter>
  </React.StrictMode>,
);
