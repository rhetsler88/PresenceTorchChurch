import { Capacitor, registerPlugin } from "@capacitor/core";

const BluetoothPermissions = registerPlugin("BluetoothPermissions");
const SessionGuard = registerPlugin("SessionGuard");

export async function ensureBluetoothPermissions() {
  if (Capacitor.getPlatform() !== "android") return;
  if (!Capacitor.isPluginAvailable("BluetoothPermissions")) return;
  try {
    await BluetoothPermissions.request();
  } catch (err) {
    const message = err?.message || "Bluetooth permissions denied";
    const error = new Error(message);
    error.code = "BLUETOOTH_PERMISSION_DENIED";
    throw error;
  }
}

export async function openAppSettings() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("BluetoothPermissions")) {
      await BluetoothPermissions.openSettings();
      return;
    }
    if (Capacitor.isPluginAvailable("SessionGuard")) {
      await SessionGuard.openAppSettings();
    }
  } catch {
    /* ignore */
  }
}
