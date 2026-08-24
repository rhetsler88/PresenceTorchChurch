import { Capacitor, registerPlugin } from "@capacitor/core";

const HeadsetPTT = registerPlugin("HeadsetPTT");

export function isNativeHeadsetPTTAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("HeadsetPTT");
}

export async function setNativeEarbudToggleMode(enabled) {
  if (!isNativeHeadsetPTTAvailable()) return;
  await HeadsetPTT.setEarbudToggleMode({ enabled: !!enabled }).catch(() => {});
}

export async function setNativeHeadsetTransmitting(transmitting) {
  if (!isNativeHeadsetPTTAvailable()) return;
  await HeadsetPTT.setTransmitting({ transmitting: !!transmitting }).catch(() => {});
}

export async function startNativeHeadsetPTT({ onDown, onUp, onTap, earbudToggleMode = false } = {}) {
  if (!isNativeHeadsetPTTAvailable()) {
    return () => {};
  }

  await setNativeEarbudToggleMode(earbudToggleMode);

  const handles = [];
  if (onDown) {
    handles.push(await HeadsetPTT.addListener("pttDown", () => onDown()));
  }
  if (onUp) {
    handles.push(await HeadsetPTT.addListener("pttUp", () => onUp()));
  }
  if (onTap) {
    handles.push(await HeadsetPTT.addListener("pttTap", () => onTap()));
  }

  await HeadsetPTT.startListening();

  return async () => {
    await setNativeHeadsetTransmitting(false);
    await Promise.all(handles.map((handle) => handle.remove()));
    await HeadsetPTT.stopListening().catch(() => {});
  };
}
