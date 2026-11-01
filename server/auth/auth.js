import { betterAuth } from 'better-auth';

export function authOptions({ pool, config, sendVerificationEmail, sendResetPassword, databaseHooks }) {
  const mailUnavailable = async () => { throw new Error('Account mail is not configured.'); };
  return {
    appName: 'MyBookshelf', baseURL: config.baseURL, basePath: '/api/auth',
    secret: config.secret, database: pool,
    trustedOrigins: [config.baseURL],
    emailAndPassword: { enabled: true, requireEmailVerification: true, autoSignIn: false,
      minPasswordLength: 15, maxPasswordLength: 128, resetPasswordTokenExpiresIn: 30 * 60,
      revokeSessionsOnPasswordReset: true, sendResetPassword: sendResetPassword ?? mailUnavailable },
    emailVerification: { sendOnSignUp: true, autoSignInAfterVerification: false,
      expiresIn: 24 * 60 * 60, sendVerificationEmail: sendVerificationEmail ?? mailUnavailable },
    session: { expiresIn: 7 * 86400, updateAge: 86400, freshAge: 5 * 60, cookieCache: { enabled: false } },
    account: { encryptOAuthTokens: true, accountLinking: { enabled: true, disableImplicitLinking: true } },
    advanced: { cookiePrefix: 'mybookshelf_auth', useSecureCookies: config.secureCookies,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 60 },
    databaseHooks,
    // Never emit library errors containing request details, tokens or SQL values.
    logger: { disabled: true },
  };
}

export function createAccountAuth(options) { return betterAuth(authOptions(options)); }
