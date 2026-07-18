import { Capacitor, registerPlugin } from "@capacitor/core";

const BluetoothPermissions = registerPlugin("BluetoothPermissions");

export async function ensureBluetoothPermissions() {
  if (Capacitor.getPlatform() !== "android") return;
  if (!Capacitor.isPluginAvailable("BluetoothPermissions")) return;
  await BluetoothPermissions.request();
}
