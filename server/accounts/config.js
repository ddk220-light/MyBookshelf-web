export class AccountConfigurationError extends Error {
  constructor() { super('Account service configuration is incomplete or invalid.'); this.name = 'AccountConfigurationError'; }
}

export function readAccountConfig(env = process.env) {
  if (env.ACCOUNTS_ENABLED !== 'true') return Object.freeze({ enabled: false });
  try {
    const base = new URL(env.BETTER_AUTH_URL);
    const local = env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(base.hostname);
    if ((!local && base.protocol !== 'https:') || !['https:', 'http:'].includes(base.protocol)
      || base.hostname.includes('*') || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error();
    if (!['development', 'staging', 'production'].includes(env.ACCOUNTS_ENVIRONMENT)) throw new Error();
    // A preview can opt in only as isolated staging, never with production data.
    if (env.VERCEL_ENV === 'preview' && env.ACCOUNTS_ENVIRONMENT !== 'staging') throw new Error();
    if (env.VERCEL_ENV === 'production' && env.ACCOUNTS_ENVIRONMENT !== 'production') throw new Error();
    if (typeof env.BETTER_AUTH_SECRET !== 'string' || env.BETTER_AUTH_SECRET.length < 32) throw new Error();
    const database = new URL(env.ACCOUNTS_AUTH_DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(database.protocol)) throw new Error();
    return Object.freeze({ enabled: true, baseURL: base.origin, secret: env.BETTER_AUTH_SECRET,
      databaseURL: env.ACCOUNTS_AUTH_DATABASE_URL, environment: env.ACCOUNTS_ENVIRONMENT,
      secureCookies: !local });
  } catch { throw new AccountConfigurationError(); }
}
