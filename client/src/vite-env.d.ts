/// <reference types="vite/client" />

// Build-time client flags and values. Every value is a string or absent; only
// the exact string 'true' turns a flag on. Never put credentials in VITE_*.
interface ImportMetaEnv {
  readonly VITE_CONTENT_DISCOVERY_ENABLED?: string;
  readonly VITE_CHILDREN_PILOT_ENABLED?: string;
  readonly VITE_DEPLOYMENT_ENV?: string;
  readonly VITE_SOURCE_URL?: string;
  /** Short commit SHA of the build (vite.config.js), shown on About. */
  readonly VITE_APP_VERSION?: string;
  /** Effective date of the Privacy and Terms texts, set at release. */
  readonly VITE_POLICY_EFFECTIVE_DATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
