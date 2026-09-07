import AgoraRTC from "agora-rtc-sdk-ng";
import { replayActiveRemoteTracks } from "@/lib/agoraRemote";
import { unlockAudioForPTT } from "@/lib/pttTones";

let configured = false;

/** One-time Agora SDK setup (log noise reduction + iOS autoplay recovery). */
export function configureAgoraSdk() {
  if (configured) return;
  configured = true;
  // 4 = no SDK console logs; browser may still log WS close during aborted joins
  AgoraRTC.setLogLevel(4);
  AgoraRTC.disableLogUpload();
  AgoraRTC.onAutoplayFailed = () => {
    unlockAudioForPTT();
    replayActiveRemoteTracks();
  };
}
