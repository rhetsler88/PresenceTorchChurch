import { Capacitor, registerPlugin } from "@capacitor/core";

export const SessionGuard = registerPlugin("SessionGuard");

async function callSessionGuard(method, payload) {
  if (!Capacitor.isNativePlatform()) return undefined;
  try {
    return await SessionGuard[method](payload);
  } catch (err) {
    console.warn(`[SessionGuard] ${method} failed:`, err?.message || err);
    return undefined;
  }
}

export async function syncNativeGoogleSignInPending(pending) {
  await callSessionGuard("setGoogleSignInPending", { pending });
}

export async function syncNativeActiveSession(active) {
  await callSessionGuard("setActiveSession", { active });
}

export async function syncNativeSensitiveOperation(pending) {
  await callSessionGuard("setSensitiveOperationPending", { pending });
}

export async function syncNativeIdleLogoutDeadline(deadlineMs) {
  await callSessionGuard("setIdleLogoutDeadline", { deadlineMs: deadlineMs || 0 });
}

export async function consumeNativeForceLogoutPending() {
  const result = await callSessionGuard("consumeForceLogoutOnNextStart");
  return result?.pending === true;
}

export async function markNativeForceLogoutOnNextStart() {
  await callSessionGuard("markForceLogoutOnNextStart");
}

export async function clearNativeForceLogoutOnNextStart() {
  await callSessionGuard("clearForceLogoutOnNextStart");
}

export async function revokeNativeGoogleSignInSession() {
  await callSessionGuard("revokeGoogleSignInSession");
}

export async function clearNativeTextMessageNotifications() {
  await callSessionGuard("clearTextMessageNotifications");
}
