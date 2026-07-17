import AgoraRTC from "agora-rtc-sdk-ng";

let configured = false;

/** One-time Agora SDK setup (log noise reduction). */
export function configureAgoraSdk() {
  if (configured) return;
  configured = true;
  // 4 = no SDK console logs; network 501s from statscollector may still appear in DevTools
  AgoraRTC.setLogLevel(import.meta.env.DEV ? 2 : 4);
  AgoraRTC.disableLogUpload();
}
