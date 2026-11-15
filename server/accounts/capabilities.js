import { configuredProviders } from "../auth/providers.js";

// Which ways to create or enter an account this deployment offers. Read from
// configuration only, so the route answers without starting the account service
// (a guest's shelf asks this before showing its account invite).
export function accountCapabilities(config) {
  const providers = configuredProviders(config);
  return {
    email: Boolean(config.jobSecret?.length >= 32 && config.mailFrom && config.resendKey),
    google: Boolean(providers.google),
    apple: Boolean(providers.apple && config.secureCookies),
    canonicalOrigin: config.baseURL,
  };
}
