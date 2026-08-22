import { Capacitor, registerPlugin } from "@capacitor/core";

const HeadsetPTT = registerPlugin("HeadsetPTT");

export function isNativeHeadsetPTTAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("HeadsetPTT");
}

export async function startNativeHeadsetPTT({ onDown, onUp, onTap } = {}) {
  if (!isNativeHeadsetPTTAvailable()) {
    return () => {};
  }

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
    await Promise.all(handles.map((handle) => handle.remove()));
    await HeadsetPTT.stopListening().catch(() => {});
  };
}
