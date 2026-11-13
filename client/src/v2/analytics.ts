// Cookieless page-visit analytics (plan 4.6.1, Phase 11). Page visits only,
// with URLs scrubbed by shared/analytics.mjs (no query strings, fragments,
// book keys, account paths or the admin view). Off unless the build sets
// VITE_ANALYTICS_ENABLED=true, and never in development builds.
import { analyticsSettingOn, installAnalytics } from '../../../shared/analytics.mjs';

export { analyticsBeforeSend, scrubAnalyticsUrl } from '../../../shared/analytics.mjs';

export function analyticsEnabled(environment: Record<string, unknown> = import.meta.env): boolean {
  return analyticsSettingOn(environment.VITE_ANALYTICS_ENABLED) && environment.PROD === true;
}

export function startAnalytics(environment: Record<string, unknown> = import.meta.env, win: Window = window, doc: Document = document): boolean {
  if (!analyticsEnabled(environment)) return false;
  return installAnalytics(win, doc);
}
