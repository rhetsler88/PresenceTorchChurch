import { GoogleAuthProvider, OAuthProvider } from "firebase/auth";

export const OAUTH_PROVIDER_IDS = {
  google: "google.com",
  apple: "apple.com",
};

export const OAUTH_PROVIDER_LABELS = {
  [OAUTH_PROVIDER_IDS.google]: "Google",
  [OAUTH_PROVIDER_IDS.apple]: "Apple",
};

export function buildOAuthProvider(providerId) {
  if (providerId === OAUTH_PROVIDER_IDS.google) {
    return new GoogleAuthProvider();
  }
  const appleProvider = new OAuthProvider("apple.com");
  appleProvider.addScope("email");
  appleProvider.addScope("name");
  return appleProvider;
}

export function nativeCredentialToFirebaseCredential(providerId, nativeCredential) {
  if (providerId === OAUTH_PROVIDER_IDS.google) {
    return GoogleAuthProvider.credential(
      nativeCredential.idToken,
      nativeCredential.accessToken ?? undefined
    );
  }
  const provider = new OAuthProvider("apple.com");
  return provider.credential({
    idToken: nativeCredential.idToken,
    rawNonce: nativeCredential.nonce,
  });
}

export function pendingCredentialFromAuthError(error, providerId) {
  if (providerId === OAUTH_PROVIDER_IDS.google) {
    return GoogleAuthProvider.credentialFromError(error);
  }
  return OAuthProvider.credentialFromError(error);
}

export function createAccountLinkRequiredError(error, providerId, pendingCredential) {
  const email = error?.customData?.email || "";
  return Object.assign(
    new Error(
      `An account with this email already exists. Enter your password to link ${OAUTH_PROVIDER_LABELS[providerId] || "this provider"}.`
    ),
    {
      code: "auth/account-link-required",
      email,
      providerId,
      pendingCredential,
      cause: error,
    }
  );
}

export function isAccountLinkRequiredError(error) {
  return error?.code === "auth/account-link-required";
}

export function getProviderLabel(providerId) {
  return OAUTH_PROVIDER_LABELS[providerId] || "Sign-in provider";
}
