import { privateName } from "../accounts/validation.js";
const chosenName = (profile) => {
  try {
    return { name: privateName(profile.name), image:null };
  } catch {
    return { name: "", image:null };
  }
};
export function configuredProviders(config) {
  return {
    ...(config.googleClientId && config.googleClientSecret
      ? {
          google: {
            clientId: config.googleClientId,
            clientSecret: config.googleClientSecret,
            prompt: "select_account",
            includeGrantedScopes: false,
            overrideUserInfoOnSignIn: false,
            mapProfileToUser: chosenName,
          },
        }
      : {}),
    ...(config.appleClientId && config.appleClientSecret
      ? {
          apple: {
            clientId: config.appleClientId,
            clientSecret: config.appleClientSecret,
            overrideUserInfoOnSignIn: false,
            mapProfileToUser: chosenName,
          },
        }
      : {}),
  };
}
