import { betterAuth } from "better-auth";
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

export function authOptions({
  pool,
  config,
  sendVerificationEmail,
  sendResetPassword,
  onExistingUserSignUp,
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
      minPasswordLength: 15,
      maxPasswordLength: 256,
      resetPasswordTokenExpiresIn: 30 * 60,
      revokeSessionsOnPasswordReset: true,
      onExistingUserSignUp,
      sendResetPassword: sendResetPassword ?? mailUnavailable,
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      expiresIn: 24 * 60 * 60,
      sendVerificationEmail: sendVerificationEmail ?? mailUnavailable,
    },
    session: {
      expiresIn: 7 * 86400,
      updateAge: 86400,
      freshAge: 5 * 60,
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
      cookiePrefix: "mybookshelf_auth",
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
