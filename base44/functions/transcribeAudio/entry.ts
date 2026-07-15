import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();

    // Support both direct invocation ({ audio_url, message_id }) and entity automation ({ event, data })
    let audio_url, message_id;
    if (body.event && body.data) {
      // Entity automation payload
      audio_url = body.data.audio_url;
      message_id = body.data.id || body.event.entity_id;
    } else {
      audio_url = body.audio_url;
      message_id = body.message_id;
    }

    if (!audio_url || !message_id) {
      return Response.json({ error: 'audio_url and message_id are required' }, { status: 400 });
    }

    // 1. Resolve private file URIs to a signed URL before fetching
    let fetchUrl = audio_url;
    if (!audio_url.startsWith('http')) {
      try {
        const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
          file_uri: audio_url,
          expires_in: 300,
        });
        fetchUrl = signed_url;
      } catch (e) {
        return Response.json({ error: `Failed to resolve private audio: ${e.message}` }, { status: 500 });
      }
    }

    // 2. Fetch the audio file from storage
    const fetchResp = await fetch(fetchUrl);
    if (!fetchResp.ok) {
      return Response.json({ error: `Failed to fetch audio: ${fetchResp.status}` }, { status: 500 });
    }

    const blob = await fetchResp.blob();

    // 2. Re-create with correct audio/webm content type
    const correctedBlob = new Blob([blob], { type: 'audio/webm' });
    const correctedFile = new File([correctedBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });

    // 3. Upload the corrected file
    const { file_url: new_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file: correctedFile });

    // 4. Transcribe with the corrected URL
    let transcript;
    try {
      transcript = await base44.asServiceRole.integrations.Core.TranscribeAudio({ audio_url: new_url });
      if (!transcript || transcript.trim().length === 0) {
        transcript = '[No speech detected]';
      }
    } catch (transcribeErr) {
      // If re-upload approach still fails, try converting to WAV via InvokeLLM as last resort
      try {
        const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: 'Transcribe this audio message exactly as spoken. Return only the transcribed text. If no speech is detectable, return "[No speech detected]".',
          file_urls: [new_url],
          response_json_schema: {
            type: 'object',
            properties: { transcript: { type: 'string' } },
            required: ['transcript']
          }
        });
        transcript = llmResult?.transcript || '[Transcription unavailable]';
      } catch (llmErr) {
        transcript = '[Transcription unavailable]';
      }
    }

    // 5. Update the message
    await base44.asServiceRole.entities.VoiceMessage.update(message_id, {
      transcript,
      is_transcribed: true,
    });

    return Response.json({ success: true, transcript, message_id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});