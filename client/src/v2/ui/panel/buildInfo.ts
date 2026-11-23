// Values fixed when the bundle is built (vite.config.js, plan section 10.1).
// An absent value is left out, so a build never sends an invented version.
// (The policy texts' effective date is committed and filled in at build time:
// shared/policy-effective-date.mjs.)
// Each default reads its one key: passing `import.meta.env` itself as a value
// makes Vite inline the whole object, with every VITE_* variable of the build host.

/** Short commit SHA of this build, or null. Sent with problem reports. */
export function appVersion(environment: Record<string, unknown> = { VITE_APP_VERSION: import.meta.env.VITE_APP_VERSION }): string | null {
  const value = environment.VITE_APP_VERSION;
  return typeof value === 'string' && /^[\w.+-]{1,64}$/.test(value) ? value : null;
}
