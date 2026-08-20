import { Capacitor } from "@capacitor/core";

/**
 * On native, mic access is handled by WebView getUserMedia → Capacitor
 * BridgeWebChromeClient.onPermissionRequest (RECORD_AUDIO + MODIFY_AUDIO_SETTINGS).
 * Do not pre-request via a custom plugin — that bypasses WebView and breaks recording.
 */
export async function ensureMicrophonePermission() {
  if (!Capacitor.isNativePlatform()) return true;
  return true;
}
