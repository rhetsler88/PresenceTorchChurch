import { etzDayKey } from "@/lib/etz";

/** Matches server-side voice message cleanup retention. */
export const TRANSCRIPT_RETENTION_DAYS = 10;

export function getTranscriptRetentionCutoffDate() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - TRANSCRIPT_RETENTION_DAYS);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

export function getMessageDayKey(message) {
  if (message?.device_date) return message.device_date;
  if (message?.created_date) return etzDayKey(message.created_date);
  return null;
}

export function isMessageWithinRetention(message) {
  if (!message?.created_date) return false;
  return new Date(message.created_date) >= getTranscriptRetentionCutoffDate();
}
