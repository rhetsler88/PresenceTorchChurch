import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { NativeBiometric, AccessControl, BiometryType } from "@capgo/capacitor-native-biometric";
import { beginSensitiveOperation, endSensitiveOperation } from "@/lib/sensitiveOperation";

const BIOMETRIC_SERVER = "church.presencetorch.app";
const BIOMETRIC_ENABLED_KEY = "biometric_sign_in_enabled";

/** Android only: Keystore validity window avoids BiometricPrompt CryptoObject (TEE crash on some devices). */
const ANDROID_AUTH_VALIDITY_SECONDS = 10;

export function isBiometricPlatform() {
  return Capacitor.isNativePlatform();
}

export async function isBiometricHardwareAvailable() {
  if (!isBiometricPlatform()) return false;
  try {
    const result = await NativeBiometric.isAvailable({ useFallback: false });
    return result.isAvailable === true;
  } catch {
    return false;
  }
}

export async function getBiometricLabel() {
  if (!isBiometricPlatform()) return "Biometric";
  try {
    const result = await NativeBiometric.isAvailable();
    switch (result.biometryType) {
      case BiometryType.FACE_ID:
      case BiometryType.FACE_AUTHENTICATION:
        return "Face ID";
      case BiometryType.TOUCH_ID:
      case BiometryType.FINGERPRINT:
        return "Fingerprint";
      case /** @type {any} */ (BiometryType).IRIS:
        return "Iris scan";
      default:
        return "Biometric";
    }
  } catch {
    return "Biometric";
  }
}

export async function isBiometricSignInEnabled() {
  if (!isBiometricPlatform()) return false;
  const { value } = await Preferences.get({ key: BIOMETRIC_ENABLED_KEY });
  return value === "true";
}

export async function hasBiometricSignIn() {
  if (!(await isBiometricSignInEnabled())) return false;
  return isBiometricHardwareAvailable();
}

function secureCredentialOptions() {
  const options = {
    server: BIOMETRIC_SERVER,
    accessControl: AccessControl.BIOMETRY_ANY,
    title: "Sign in",
    negativeButtonText: "Cancel",
  };
  if (Capacitor.getPlatform() === "android") {
    options.authValidityDuration = ANDROID_AUTH_VALIDITY_SECONDS;
  }
  return options;
}

export async function saveBiometricCredentials(email, password) {
  if (!isBiometricPlatform()) return;

  const available = await isBiometricHardwareAvailable();
  if (!available) {
    throw new Error("Biometric hardware is not available on this device.");
  }

  beginSensitiveOperation();
  try {
    try {
      await NativeBiometric.deleteCredentials({ server: BIOMETRIC_SERVER });
    } catch {
      /* ignore missing prior credentials */
    }

    await NativeBiometric.setCredentials({
      username: email.trim(),
      password,
      ...secureCredentialOptions(),
      title: "Enable sign-in",
    });
    await Preferences.set({ key: BIOMETRIC_ENABLED_KEY, value: "true" });
  } finally {
    endSensitiveOperation();
  }
}

export async function clearBiometricCredentials() {
  if (!isBiometricPlatform()) return;
  try {
    await NativeBiometric.deleteCredentials({ server: BIOMETRIC_SERVER });
  } catch {
    /* ignore */
  }
  await Preferences.set({ key: BIOMETRIC_ENABLED_KEY, value: "false" });
}

export async function signInWithBiometric() {
  if (!isBiometricPlatform()) {
    throw new Error("Biometric sign-in is only available in the mobile app.");
  }

  const label = await getBiometricLabel();

  beginSensitiveOperation();
  try {
    const credentials = await NativeBiometric.getSecureCredentials({
      ...secureCredentialOptions(),
      reason: "Sign in to Presence Torch",
      subtitle: `Confirm with ${label}`,
      description: `Use ${label} to sign in quickly`,
    });

    return {
      email: credentials.username,
      password: credentials.password,
    };
  } finally {
    endSensitiveOperation();
  }
}

/** User dismissed the biometric prompt — not an error. */
export function isBiometricCancelled(err) {
  const code = err?.code;
  const message = String(err?.message || "").toLowerCase();
  return (
    code === 10
    || code === 13
    || code === 16
    || code === "10"
    || code === "13"
    || code === "16"
    || message.includes("cancel")
    || message.includes("canceled")
    || message.includes("cancelled")
  );
}
