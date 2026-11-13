// Cookieless page-visit analytics (plan 4.6.1, Phase 11): Vercel Web
// Analytics, page visits only. On the Pro plan every analytics event is
// billed and custom events have no free allowance, so no custom event is ever
// sent; counts such as searches per day come from our own anonymous log.
// Nothing here is linked to an account, and no cookie is set.
//
// Off unless the build sets VITE_ANALYTICS_ENABLED=true (the app, production
// builds only) - the same setting adds the script to the public pages in
// tools/seo/build-pages.mjs. Vercel serves the script and the collector from
// our own origin (/_vercel/insights/*), so the CSP needs no new host.
//
// Every reported URL goes through analyticsBeforeSend first: query strings
// and fragments are dropped (verification and reset links, the landing form's
// ?q=), book and reading keys are collapsed (/app/books/[book],
// /app/read/[item]), every /app/account/* path becomes /app/account, the
// admin view is never reported, and any other unexpected path is collapsed so
// typed text in an address cannot reach analytics.
//
// These functions are self-contained (no module-level references) because
// build-pages.mjs writes their source into the public pages' /insights.js.

/** @param {string} value @returns {string | null} */
export function scrubAnalyticsUrl(value) {
  var url;
  try { url = new URL(String(value), 'https://mybookshelf.cloud'); } catch (error) { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  var path = url.pathname.replace(/\/+$/, '') || '/';
  if (/^\/app\/admin(?:\/|$)/i.test(path)) return null;
  // The one-shelf app's pages (plan 3.1), then the old addresses that now
  // redirect to the shelf (/app/libraries is still the landing page's "Find
  // my library" entry). A redirect replaces the address before the next view.
  var known = ['/app', '/app/shelf', '/app/settings/account', '/app/settings/account/more',
    '/app/report', '/app/privacy', '/app/terms', '/app/about',
    '/app/search', '/app/libraries', '/app/settings'];
  if (/^\/app\/books(?:\/|$)/.test(path)) path = '/app/books/[book]';
  else if (/^\/app\/read(?:\/|$)/.test(path)) path = '/app/read/[item]';
  else if (/^\/app\/account(?:\/|$)/.test(path)) path = '/app/account';
  else if (/^\/app(?:\/|$)/.test(path)) { if (known.indexOf(path) < 0) path = '/app/[other]'; }
  else if (/^\/select(?:\/|$)/.test(path)) { if (!/^\/select(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(path)) path = '/select/[other]'; }
  // The public pages by name and library guides by slug; anything else (a
  // mistyped or pasted address, shown the 404 page) is not reported as typed.
  else if (['/', '/libraries', '/about', '/how-it-works', '/open-source', '/privacy', '/support'].indexOf(path) < 0
    && !/^\/libraries\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)) path = '/[other]';
  return url.origin + path;
}

/**
 * Vercel's beforeSend hook. Page views only: any other event is dropped.
 * @param {{ type?: string, url?: string } | null | undefined} event
 */
export function analyticsBeforeSend(event) {
  if (!event || event.type !== 'pageview') return null;
  var url = scrubAnalyticsUrl(event.url || '');
  if (!url) return null;
  return { type: event.type, url: url };
}

/**
 * Queues the beforeSend hook, then loads Vercel's script from our origin.
 * Safe to call twice. Never sets a cookie.
 * @param {any} win @param {Document} doc
 */
export function installAnalytics(win, doc) {
  if (win.__mybookshelfAnalytics) return false;
  win.__mybookshelfAnalytics = true;
  win.va = win.va || function () { (win.vaq = win.vaq || []).push(arguments); };
  win.va('beforeSend', analyticsBeforeSend);
  var script = doc.createElement('script');
  script.src = '/_vercel/insights/script.js';
  script.defer = true;
  doc.head.appendChild(script);
  return true;
}

/** The public pages' /insights.js: the same three functions, run at once. */
export function analyticsScriptSource() {
  return '(function(){"use strict";\n' + scrubAnalyticsUrl.toString() + '\n' + analyticsBeforeSend.toString() + '\n'
    + installAnalytics.toString() + '\ninstallAnalytics(window, document);\n})();\n';
}

/** True when a build should load analytics. */
export function analyticsSettingOn(value) {
  // Exactly "true", as client/src/main.tsx checks, so the app and the public
  // pages are always both on or both off.
  return value === 'true';
}

// Search Console: the owner's google-site-verification token, a build
// setting (GOOGLE_SITE_VERIFICATION). Only a plain token is accepted;
// anything else adds nothing. DNS verification needs no setting at all.
export function siteVerificationToken(value) {
  var token = String(value == null ? '' : value).trim();
  return /^[A-Za-z0-9_-]{20,100}$/.test(token) ? token : null;
}
