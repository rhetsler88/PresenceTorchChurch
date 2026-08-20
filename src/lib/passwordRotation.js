import { PASSWORD_ROTATION_MS } from "@/lib/passwordPolicy";

const PASSWORD_LOGIN_SESSION_KEY = "presence_password_login_session";
const PASSWORD_ROTATION_DISMISS_KEY = "presence_password_rotation_dismissed";

/** Mark that this session started with an email/password sign-in (includes biometric). */
export function markPasswordLoginSession() {
  sessionStorage.removeItem(PASSWORD_ROTATION_DISMISS_KEY);
  sessionStorage.setItem(PASSWORD_LOGIN_SESSION_KEY, "1");
}

export function clearPasswordLoginSession() {
  sessionStorage.removeItem(PASSWORD_LOGIN_SESSION_KEY);
  sessionStorage.removeItem(PASSWORD_ROTATION_DISMISS_KEY);
}

export function isPasswordLoginSession() {
  return sessionStorage.getItem(PASSWORD_LOGIN_SESSION_KEY) === "1";
}

export function dismissPasswordRotationReminder() {
  sessionStorage.setItem(PASSWORD_ROTATION_DISMISS_KEY, "1");
}

export function isPasswordRotationDismissed() {
  return sessionStorage.getItem(PASSWORD_ROTATION_DISMISS_KEY) === "1";
}

export function getPasswordUpdatedAt(user, firebaseUser) {
  if (user?.password_updated_at) {
    return new Date(user.password_updated_at);
  }
  if (firebaseUser?.metadata?.creationTime) {
    return new Date(firebaseUser.metadata.creationTime);
  }
  return null;
}

export function isPasswordRotationDue(user, firebaseUser) {
  const updatedAt = getPasswordUpdatedAt(user, firebaseUser);
  if (!updatedAt || Number.isNaN(updatedAt.getTime())) {
    return true;
  }
  return Date.now() - updatedAt.getTime() >= PASSWORD_ROTATION_MS;
}

export function getPasswordRotationMessage() {
  return "Your password has not been changed in over 270 days. Consider updating it to keep your account secure.";
}
