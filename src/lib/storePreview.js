/** App Store screenshot capture: `/login?storePreview=1` shows native biometric chrome. */
export function isStorePreview() {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("storePreview") === "1";
  } catch {
    return false;
  }
}
