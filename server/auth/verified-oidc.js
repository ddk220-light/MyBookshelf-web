import { verifyProviderIdToken } from "@better-auth/core/oauth2";
import { authorizeProviderSubject } from "./provider-intents.js";

// Pinned built-in redirect providers obtain an ID token over TLS but do not
// enable the common nonce verifier themselves. Adapt the public OAuthProvider
// interface using the library's own nonce generation, state store and verifier.
export const verifiedOidc = {
  id: "mybookshelf-verified-oidc",
  init(context) {
    return {
      context: {
        socialProviders: context.socialProviders.map((provider) => {
          if (!["google", "apple"].includes(provider.id)) return provider;
          if (!provider.idToken)
            throw new Error("Configured OIDC verifier is unavailable.");
          return {
            ...provider,
            requiresIdTokenNonce: true,
            issuer:
              provider.id === "google"
                ? "https://accounts.google.com"
                : "https://appleid.apple.com",
            async createAuthorizationURL(data) {
              if (!data.idTokenNonce)
                throw new Error("Provider nonce is unavailable.");
              const url = await provider.createAuthorizationURL(data);
              url.searchParams.set("nonce", data.idTokenNonce);
              return url;
            },
            async getUserInfo(tokens) {
              if (
                !tokens.idToken ||
                !tokens.expectedIdTokenNonce ||
                !(await verifyProviderIdToken(
                  provider,
                  tokens.idToken,
                  tokens.expectedIdTokenNonce,
                ))
              )
                return null;
              const result = await provider.getUserInfo(tokens);
              if (result?.user)
                await authorizeProviderSubject(
                  provider.id,
                  await provider.accountSubject({
                    tokens,
                    profile: result.data,
                  }),
                );
              return result;
            },
          };
        }),
      },
    };
  },
};
