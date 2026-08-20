import { Capacitor, registerPlugin } from "@capacitor/core";

export const SessionGuard = registerPlugin("SessionGuard");

export async function syncNativeGoogleSignInPending(pending) {
  if (!Capacitor.isNativePlatform()) return;
  await SessionGuard.setGoogleSignInPending({ pending });
}

export async function syncNativeActiveSession(active) {
  if (!Capacitor.isNativePlatform()) return;
  await SessionGuard.setActiveSession({ active });
}
