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

export async function syncNativeSensitiveOperation(pending) {
  if (!Capacitor.isNativePlatform()) return;
  await SessionGuard.setSensitiveOperationPending({ pending });
}

export async function syncNativeIdleLogoutDeadline(deadlineMs) {
  if (!Capacitor.isNativePlatform()) return;
  await SessionGuard.setIdleLogoutDeadline({ deadlineMs: deadlineMs || 0 });
}
