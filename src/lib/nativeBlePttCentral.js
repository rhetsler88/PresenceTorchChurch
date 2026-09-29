import { Capacitor, registerPlugin } from "@capacitor/core";

const BlePttCentral = registerPlugin("BlePttCentral");

export function isNativeBlePttCentralAvailable() {
  return (
    Capacitor.isNativePlatform()
    && Capacitor.getPlatform() === "ios"
    && Capacitor.isPluginAvailable("BlePttCentral")
  );
}

/**
 * iOS background BLE PTT (CoreBluetooth + bluetooth-central mode).
 * Complements Capacitor BLE while the screen is off.
 */
export async function startNativeBlePttCentral({
  peripheralId,
  serviceUuid,
  characteristicUuid,
  onDown,
  onUp,
} = {}) {
  if (!isNativeBlePttCentralAvailable() || !peripheralId || !serviceUuid || !characteristicUuid) {
    return () => {};
  }

  await BlePttCentral.configure({
    peripheralId,
    serviceUuid,
    characteristicUuid,
  });

  const handles = [];
  if (onDown) {
    handles.push(await BlePttCentral.addListener("pttDown", () => onDown()));
  }
  if (onUp) {
    handles.push(await BlePttCentral.addListener("pttUp", () => onUp()));
  }

  await BlePttCentral.start();

  return async () => {
    await Promise.all(handles.map((h) => h.remove()));
    await BlePttCentral.stop().catch(() => {});
  };
}
