import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins/magic-link";
import { accountMailSchema } from "./mail-schema.js";
import { lifecycleSchema } from "./lifecycle-schema.js";
import { configuredProviders } from "./providers.js";
import {
  oauthDatabaseHooks,
  mergeDatabaseHooks,
  beforeOAuth,
} from "./oauth-hooks.js";
import { verifiedOidc } from "./verified-oidc.js";
import { providerIntents } from "./provider-intents.js";
import { passwordRotation } from "./password-rotation.js";
import { passwordBudget } from "./password-budget.js";
import {deletionSchema} from './deletion-schema.js';
import { AUTH_COOKIE_PREFIX } from "./cookies.js";

export function authOptions({
  pool,
  config,
  sendVerificationEmail,
  sendResetPassword,
  onExistingUserSignUp,
  sendMagicLink,
  databaseHooks,
  getAuth,
}) {
  const mailUnavailable = async () => {
    throw new Error("Account mail is not configured.");
  };
  return {
    appName: "MyBookshelf",
    baseURL: config.baseURL,
    basePath: "/api/auth",
    secret: config.secret,
    database: pool,
    trustedOrigins: [config.baseURL],
    socialProviders: configuredProviders(config),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      password: { hash: passwordBudget.hash, verify: passwordBudget.verify },
      // No password rules (owner's decision): 1 is the smallest the library
      // accepts. Keep it equal to accounts/validation.js, or a refusal here
      // shows the reader "Couldn't connect".
      minPasswordLength: 1,
      maxPasswordLength: 256,
      resetPasswordTokenExpiresIn: 30 * 60,
      revokeSessionsOnPasswordReset: true,
      onExistingUserSignUp,
      sendResetPassword: sendResetPassword ?? mailUnavailable,
    },
    emailVerification: {
      sendOnSignUp: true,
      // The verification link signs the reader in (single use, 24 hours).
      autoSignInAfterVerification: true,
      expiresIn: 24 * 60 * 60,
      sendVerificationEmail: sendVerificationEmail ?? mailUnavailable,
    },
    session: {
      expiresIn: 7 * 86400,
      updateAge: 86400,
      // Within 10 minutes of signing in, changing the email or password does
      // not ask for the password again (deleting the account always does).
      freshAge: 10 * 60,
      cookieCache: { enabled: false },
    },
    account: {
      encryptOAuthTokens: true,
      storeAccountCookie: false,
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        updateUserInfoOnLink: false,
        allowDifferentEmails: true,
      },
    },
    user: {
      changeEmail: { enabled: true, updateEmailWithoutVerification: false },
    },
    hooks: { before: beforeOAuth },
    advanced: {
      cookiePrefix: AUTH_COOKIE_PREFIX,
      useSecureCookies: config.secureCookies,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 60 },
    databaseHooks: mergeDatabaseHooks(
      oauthDatabaseHooks(getAuth),
      databaseHooks,
    ),
    plugins: [
      accountMailSchema,
      lifecycleSchema,
      providerIntents,
      verifiedOidc,
      passwordRotation,
      deletionSchema,
      // Log in with an emailed link: existing accounts only, single use,
      // 15 minutes, only a hash of the token is stored. Reached only through
      // the /api/account facade (auth-actions.js), never the raw routes.
      magicLink({
        storeToken: "hashed",
        expiresIn: 15 * 60,
        disableSignUp: true,
        sendMagicLink: sendMagicLink ?? mailUnavailable,
      }),
    ],
    // Never emit library errors containing request details, tokens or SQL values.
    logger: { disabled: true },
  };
}

export function createAccountAuth(options) {
  let auth;
  auth = betterAuth(authOptions({ ...options, getAuth: () => auth }));
  return auth;
}
