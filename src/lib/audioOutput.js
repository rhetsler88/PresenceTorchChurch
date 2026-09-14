import { Capacitor, registerPlugin } from "@capacitor/core";
import { isNativeVoiceProcessingAvailable } from "@/lib/nativeVoiceProcessing";

const NativeVoiceProcessing = registerPlugin("NativeVoiceProcessing");

/** Native only: wired headset or Bluetooth earbuds/headset on the audio route. */
export async function hasEarpieceConnected() {
  if (!Capacitor.isNativePlatform()) {
    return true;
  }
  if (!isNativeVoiceProcessingAvailable()) {
    return true;
  }
  try {
    const result = await NativeVoiceProcessing.hasEarpieceConnected();
    return Boolean(result?.connected);
  } catch {
    return true;
  }
}
