import { Capacitor, registerPlugin } from "@capacitor/core";

const HeadsetPTT = registerPlugin("HeadsetPTT");

export function isNativeHeadsetPTTAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("HeadsetPTT");
}

export async function startNativeHeadsetPTT({ onDown, onUp }) {
  if (!isNativeHeadsetPTTAvailable()) {
    return () => {};
  }

  const downHandle = await HeadsetPTT.addListener("pttDown", () => onDown?.());
  const upHandle = await HeadsetPTT.addListener("pttUp", () => onUp?.());

  await HeadsetPTT.startListening();

  return async () => {
    await downHandle.remove();
    await upHandle.remove();
    await HeadsetPTT.stopListening().catch(() => {});
  };
}
