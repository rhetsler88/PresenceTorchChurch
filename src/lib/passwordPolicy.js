export const MIN_PASSWORD_LENGTH = 8;
export const PASSWORD_ROTATION_DAYS = 270;
export const PASSWORD_ROTATION_MS = PASSWORD_ROTATION_DAYS * 24 * 60 * 60 * 1000;

export function getPasswordLengthErrorMessage() {
  return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
}

export function validatePasswordLength(password) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw Object.assign(new Error(getPasswordLengthErrorMessage()), {
      code: "auth/weak-password",
    });
  }
}

export function validateNewPasswordDifferent(currentPassword, newPassword) {
  if (currentPassword === newPassword) {
    throw Object.assign(new Error("New password must be different from your current password."), {
      code: "auth/same-password",
    });
  }
}
