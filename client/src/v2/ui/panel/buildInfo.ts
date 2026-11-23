// Values fixed when the bundle is built (vite.config.js, plan section 10.1).
// Absent values leave the policy texts' own placeholders visible, so an
// unreleased build never shows an invented date or version.
// Each default reads its one key: passing `import.meta.env` itself as a value
// makes Vite inline the whole object, with every VITE_* variable of the build host.

/** Short commit SHA of this build, or null. Also sent with problem reports. */
export function appVersion(environment: Record<string, unknown> = { VITE_APP_VERSION: import.meta.env.VITE_APP_VERSION }): string | null {
  const value = environment.VITE_APP_VERSION;
  return typeof value === 'string' && /^[\w.+-]{1,64}$/.test(value) ? value : null;
}

/** Effective date of the Privacy and Terms texts (VITE_POLICY_EFFECTIVE_DATE, set at release), or null. */
export function policyEffectiveDate(environment: Record<string, unknown> = { VITE_POLICY_EFFECTIVE_DATE: import.meta.env.VITE_POLICY_EFFECTIVE_DATE }): string | null {
  const value = environment.VITE_POLICY_EFFECTIVE_DATE;
  return typeof value === 'string' && /^[\p{L}\p{N} ,.-]{4,40}$/u.test(value.trim()) ? value.trim() : null;
}
