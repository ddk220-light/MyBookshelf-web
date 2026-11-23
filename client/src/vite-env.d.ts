/// <reference types="vite/client" />

// Build-time client flags and values. Every value is a string or absent; only
// the exact string 'true' turns a flag on. Never put credentials in VITE_*.
interface ImportMetaEnv {
  readonly VITE_ANALYTICS_ENABLED?: string;
  readonly VITE_CONTENT_DISCOVERY_ENABLED?: string;
  readonly VITE_CHILDREN_PILOT_ENABLED?: string;
  readonly VITE_DEPLOYMENT_ENV?: string;
  readonly VITE_SOURCE_URL?: string;
  /** Short commit SHA of the build (vite.config.js), sent with problem reports. */
  readonly VITE_APP_VERSION?: string;
  // The policy texts' effective date is not a build setting: it is committed
  // in shared/policy-effective-date.mjs and filled in by vite.config.js.
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
