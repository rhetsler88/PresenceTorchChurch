import { api } from "@/api/client";

/** True when a voice message still needs Speech-to-Text. */
export function needsTranscription(message) {
  return Boolean(
    message?.audio_url
    && !message.text_content
    && !message.transcript
    && !message.is_transcribed
  );
}

/** Transcribe a single message on replay (idempotent). */
export async function requestTranscription(message) {
  if (!message?.id || !message?.audio_url || !needsTranscription(message)) {
    return message?.transcript || message?.text_content || null;
  }

  /** @type {{ transcript?: string }} */
  const result = await api.functions.invoke("transcribeAudio", {
    message_id: message.id,
    audio_url: message.audio_url,
  });
  return result?.transcript ?? null;
}

/** Batch-transcribe messages before log export; dedupes by audio_url on the server. */
export async function transcribeMessagesForExport(messages) {
  const pendingIds = messages
    .filter(needsTranscription)
    .map((m) => m.id)
    .filter(Boolean);

  if (pendingIds.length === 0) {
    return {};
  }

  /** @type {{ transcripts?: Record<string, string> }} */
  const result = await api.functions.invoke("transcribeBatch", {
    message_ids: pendingIds,
  });
  return result?.transcripts ?? {};
}
