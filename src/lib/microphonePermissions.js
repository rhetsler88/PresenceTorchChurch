import { Capacitor, registerPlugin } from "@capacitor/core";

const MicrophonePermissions = registerPlugin("MicrophonePermissions");

export async function ensureMicrophonePermission() {
  if (!Capacitor.isNativePlatform()) return true;
  if (!Capacitor.isPluginAvailable("MicrophonePermissions")) return true;
  try {
    await MicrophonePermissions.request();
    return true;
  } catch {
    return false;
  }
}
