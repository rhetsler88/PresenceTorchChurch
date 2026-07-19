import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { Capacitor } from "@capacitor/core";

/**
 * Firebase App Check (free tier — reCAPTCHA v3 site key required).
 * Register the web app in Firebase Console → App Check → reCAPTCHA v3.
 * Start enforcement in Monitor mode before Enforce.
 *
 * Vercel: set VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY to the same key
 * registered in Firebase Console (not a random reCAPTCHA key from another project).
 * Add your Vercel domain(s) in https://www.google.com/recaptcha/admin
 */

const PLACEHOLDER_PATTERN = /^(your_|xxx+|test|placeholder|changeme|todo)/i;
/** reCAPTCHA v3 site keys are 40 chars and start with 6L */
const RECAPTCHA_V3_SITE_KEY_PATTERN = /^6L[\w-]{38}$/;

export function isValidRecaptchaSiteKey(siteKey) {
  if (!siteKey || typeof siteKey !== "string") return false;
  const trimmed = siteKey.trim();
  if (PLACEHOLDER_PATTERN.test(trimmed)) return false;
  return RECAPTCHA_V3_SITE_KEY_PATTERN.test(trimmed);
}

export function initAppCheck(app) {
  const siteKey = import.meta.env.VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY?.trim();

  if (!siteKey) {
    if (import.meta.env.DEV) {
      console.info(
        "App Check skipped — set VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY in .env.local"
      );
    }
    return false;
  }

  if (!isValidRecaptchaSiteKey(siteKey)) {
    console.warn(
      "App Check skipped — VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY looks invalid. " +
        "Use the reCAPTCHA v3 site key registered in Firebase Console → App Check. " +
        "If Firestore App Check enforcement is enabled, fix the key or disable enforcement."
    );
    return false;
  }

  if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN =
      import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;
  }

  if (Capacitor.isNativePlatform()) {
    // Native attestation (Play Integrity / App Attest) is configured in Firebase Console.
    // Web reCAPTCHA provider is used for Capacitor WebView until native providers are linked.
  }

  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    return true;
  } catch (err) {
    console.warn("App Check initialization failed — Firestore may reject requests if enforcement is enabled:", err);
    return false;
  }
}
