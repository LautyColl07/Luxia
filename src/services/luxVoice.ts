import { appendFormDataFile, normalizeLuxMessage, request } from './api';
import { materializeAudio } from '../voice/audioResource';
import { baseMime } from '../voice/voicePolicy';
import type { Speech, VoiceCapabilities, VoiceTransport, VoiceTurn } from '../voice/types';

// The pipeline is sequential: Whisper allows 120 s and chat allows 180 s.
// The remaining minute covers upload and Piper synthesis.
export const VOICE_TURN_TIMEOUT_MS = 120000 + 180000 + 60000;
const VOICE_SPEECH_TIMEOUT_MS = 120000;
const unwrap = (response: any) => response?.data ?? response;
function parseSpeech(value: any): Speech {
  return {
    status: value?.status === 'ready' && value.audioId ? 'ready' : 'unavailable',
    errorCode: typeof value?.errorCode === 'string' ? value.errorCode : null,
    text: typeof value?.text === 'string' ? value.text : '',
    audioId: value?.audioId ?? null,
    mimeType: value?.mimeType ?? null,
    durationMs: Number.isFinite(value?.durationMs) ? value.durationMs : null,
  };
}

export const luxVoiceTransport: VoiceTransport = {
  async capabilities(signal) {
    const cap = unwrap(await request('/lux/voice/capabilities', { signal, timeout: 15000 }));
    if (typeof cap?.enabled !== 'boolean' || typeof cap.transcriptionAvailable !== 'boolean' || typeof cap.synthesisAvailable !== 'boolean' ||
        !(cap.maxAudioBytes > 0) || !(cap.maxAudioDurationSeconds > 0) || !Array.isArray(cap.acceptedMimeTypes) || !cap.acceptedMimeTypes.every((mime: unknown) => typeof mime === 'string')) {
      throw new Error('El servidor devolvió capacidades de voz inválidas.');
    }
    return { ...cap, acceptedMimeTypes: cap.acceptedMimeTypes.map(baseMime) } as VoiceCapabilities;
  },
  async turn(recording, id, scope, mode, responseAudio, signal) {
    const result = unwrap(await request('/lux/voice/turn', {
      method: 'POST',
      // Build the multipart inside the authenticated request deadline so file
      // preparation failures share its classification, cancellation and logs.
      prepareBody: async () => {
        const body = new FormData();
        await appendFormDataFile(body, 'audio', {
          uri: recording.uri, file: recording.blob, name: recording.name, type: recording.mimeType,
        });
        body.append('clientRequestId', id);
        if (scope.conversationId && !scope.conversationId.startsWith('local-conversation-')) body.append('conversationId', scope.conversationId);
        if (scope.caseId !== null && scope.caseId !== undefined) body.append('caseId', String(scope.caseId));
        body.append('mode', mode);
        body.append('responseAudio', String(responseAudio));
        return body;
      },
      signal,
      timeout: VOICE_TURN_TIMEOUT_MS,
      timeoutMessage: 'El turno de voz superó el tiempo reservado para subida, transcripción, respuesta y síntesis.',
      diagnostics: {
        clientRequestId: id,
        fileSize: recording.size,
        audioDurationMs: recording.durationMs,
        mimeType: recording.mimeType,
        fileName: recording.name,
        uriScheme: recording.uri.split(':', 1)[0] || null,
      },
    }));
    if (result?.status === 'cancelled') {
      throw Object.assign(new Error('Solicitud cancelada.'), { code: 'CANCELLED' });
    }
    const transcript = result?.transcript ?? result?.transcription;
    if (typeof transcript === 'string' && !transcript.trim()) {
      throw Object.assign(new Error('No pudimos transcribir lo que dijiste.'), { code: 'EMPTY_TRANSCRIPT' });
    }
    const userId = result?.userMessage?.id ?? result?.userMessageId;
    const assistantId = result?.assistantMessage?.id ?? result?.assistantMessageId;
    const response = result?.response ?? result?.assistantMessage?.content ?? result?.assistantMessage?.text;
    if (!result?.conversationId || !userId || !assistantId || typeof transcript !== 'string' ||
        typeof response !== 'string' || !response.trim() ||
        (result.status && !['completed', 'completed_with_synthesis_error'].includes(result.status))) {
      throw new Error('Lux devolvió un turno de voz inválido. Conservamos el audio para reintentar el mismo pedido.');
    }
    const assistant = normalizeLuxMessage({ ...result.assistantMessage, id: assistantId, role: 'assistant', text: response, persisted: true });
    const citations = Array.isArray(result.citations) ? result.citations : assistant.citations;
    const documentsUsed = Array.isArray(result.documentsUsed) ? result.documentsUsed : assistant.documents;
    const speech = parseSpeech(result.speech);
    return {
      ...result,
      status: result.status || 'completed',
      mode: result.mode || mode,
      transcript, response, citations, documentsUsed,
      timings: result.timings && typeof result.timings === 'object' ? result.timings : {},
      userMessage: normalizeLuxMessage({ ...result.userMessage, id: userId, text: transcript, role: 'user', clientRequestId: id, persisted: true }),
      assistantMessage: { ...assistant, citations, documents: documentsUsed, speech },
      speech,
      warnings: Array.isArray(result.warnings) ? result.warnings.map((item: any) => typeof item === 'string' ? item : item?.message || item?.code || 'Advertencia de voz') : [],
    } as VoiceTurn;
  },
  async speech(messageId, id, signal) {
    const result = unwrap(await request('/lux/voice/speech', {
      method: 'POST', body: { messageId, clientRequestId: id }, signal, timeout: VOICE_SPEECH_TIMEOUT_MS,
      diagnostics: { clientRequestId: id },
    }));
    return parseSpeech(result.speech);
  },
  async audio(audioId, signal) {
    const { bytes, mimeType } = await request(`/lux/voice/audio/${encodeURIComponent(audioId)}`, { signal, responseType: 'audio', timeout: 60000, headers: { Accept: 'audio/*' } });
    if (!bytes.length) throw new Error('El servidor devolvió un audio vacío.');
    return materializeAudio(bytes, mimeType);
  },
  cancel(id) { return request(`/lux/voice/requests/${encodeURIComponent(id)}`, { method: 'DELETE', timeout: 10000 }); },
};
