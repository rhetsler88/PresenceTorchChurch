import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { Capacitor } from "@capacitor/core";

/**
 * Firebase App Check (free tier — reCAPTCHA v3 site key required).
 * Register the web app in Firebase Console → App Check → reCAPTCHA v3.
 * Start enforcement in Monitor mode before Enforce.
 */
export function initAppCheck(app) {
  const siteKey = import.meta.env.VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY;
  if (!siteKey) {
    if (import.meta.env.DEV) {
      console.info("App Check skipped — set VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY");
    }
    return;
  }

  if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN =
      import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;
  }

  if (Capacitor.isNativePlatform()) {
    // Native attestation (Play Integrity / App Attest) is configured in Firebase Console.
    // Web reCAPTCHA provider is used for Capacitor WebView until native providers are linked.
  }

  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
}
