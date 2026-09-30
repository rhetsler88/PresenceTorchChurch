import { canSendOnChannelForChannel, bypassesDailyCode } from "@/lib/userUtils";
import { isDailyCodeVerified } from "@/lib/dailyCode";
import {
  assertCanSendTextWithAccess,
  canSendTextWithAccess,
} from "./talkSendGateCore.js";

const defaultAccess = {
  canSendOnChannel: canSendOnChannelForChannel,
  bypassesDailyCode,
  isDailyCodeVerified,
};

/** Same gate as Talk `canSendPtt` / handlePTTStart — channel send permission + daily code. */
export { canSendTextWithAccess } from "./talkSendGateCore.js";

export function canSendText(user, channel) {
  return canSendTextWithAccess(user, channel, defaultAccess);
}

/** Throws before Firestore write when the Talk send gate is closed. */
export function assertCanSendText(user, channel) {
  assertCanSendTextWithAccess(user, channel, defaultAccess);
}
