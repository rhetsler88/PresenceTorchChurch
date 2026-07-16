import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { NativeBiometric, AccessControl, BiometryType } from "@capgo/capacitor-native-biometric";

const BIOMETRIC_SERVER = "church.presencetorch.app";
const BIOMETRIC_ENABLED_KEY = "biometric_sign_in_enabled";

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
      case BiometryType.IRIS:
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

export async function saveBiometricCredentials(email, password) {
  if (!isBiometricPlatform()) return;
  await NativeBiometric.setCredentials({
    username: email.trim(),
    password,
    server: BIOMETRIC_SERVER,
    accessControl: AccessControl.BIOMETRY_ANY,
  });
  await Preferences.set({ key: BIOMETRIC_ENABLED_KEY, value: "true" });
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

  const credentials = await NativeBiometric.getSecureCredentials({
    server: BIOMETRIC_SERVER,
    reason: "Sign in to Presence Torch",
    title: "Sign in",
    subtitle: "Confirm your identity",
    description: "Use biometrics to sign in quickly",
  });

  return {
    email: credentials.username,
    password: credentials.password,
  };
}
