import type { LuxMessage, Recording, VoiceCapabilities } from './types';

export const VAD_SETTINGS = { thresholdDb: -42, minimumSpeechMs: 450, silenceMs: 1200, minimumTurnMs: 900, noSpeechMs: 10000, maximumTurnMs: 45000 };
export type VadSettings = typeof VAD_SETTINGS;
export const METER_TIMEOUT_MS = 1200;
export const baseMime = (mime: string) => mime.toLowerCase().split(';')[0].trim();
export function acceptsMime(capabilities: VoiceCapabilities, mime: string) {
  return capabilities.acceptedMimeTypes.some((accepted) => baseMime(accepted) === baseMime(mime));
}
export function validateRecording(recording: Recording, cap: VoiceCapabilities) {
  if (!recording.uri || (recording.blob && !recording.blob.size)) throw new Error('No encontramos un archivo de audio válido. Volvé a grabar.');
  if (!recording.size) throw new Error('La grabación está vacía. Volvé a grabar.');
  if (!acceptsMime(cap, recording.mimeType)) throw new Error('El servidor no acepta el formato de este micrófono. Podés seguir escribiendo.');
  if (recording.size > cap.maxAudioBytes) throw new Error(`El audio supera el límite de ${(cap.maxAudioBytes / 1048576).toFixed(1)} MB. Grabá una intervención más corta.`);
  if (recording.durationMs > cap.maxAudioDurationSeconds * 1000 + 250) throw new Error('El audio supera la duración permitida. Grabá una intervención más corta.');
  if (recording.durationMs < VAD_SETTINGS.minimumSpeechMs) throw new Error('La grabación es demasiado corta. Volvé a grabar.');
}

// Amplitude metering only; no browser speech recognition or uploaded VAD data.
export class EndOfTurnDetector {
  private startTime: number;
  private previousTime: number;
  private lastSpeechTime: number;
  private speechMs = 0;
  private previousVoiced = false;
  private lastMeasurementTime: number;
  private confirmedSpeech = false;
  private lastMeasurementVoiced = false;
  reliable = false;
  constructor(now: number, private maxDurationMs: number, private settings: VadSettings = VAD_SETTINGS) {
    this.startTime = this.previousTime = this.lastSpeechTime = now;
    this.lastMeasurementTime = now;
  }
  get hasSpeech() { return this.confirmedSpeech; }
  get speaking() { return this.previousVoiced && this.hasSpeech; }
  meteringUnavailable(now: number) { return now - this.lastMeasurementTime >= METER_TIMEOUT_MS; }
  sample(db: number | undefined, now: number): 'send' | 'silence' | 'review' | null {
    const gap = Math.max(now - this.previousTime, 0);
    const delta = Math.min(gap, 200);
    this.previousTime = now;
    if (db !== undefined && Number.isFinite(db)) {
      this.reliable = true;
      this.lastMeasurementTime = now;
      this.lastMeasurementVoiced = db > this.settings.thresholdDb;
      if (db > this.settings.thresholdDb) {
        // A long gap is not evidence of continuous speech.
        if (gap > 500 && !this.hasSpeech) this.speechMs = 0;
        else if (this.previousVoiced) this.speechMs += delta;
        if (this.speechMs >= this.settings.minimumSpeechMs) this.confirmedSpeech = true;
        this.lastSpeechTime = now;
        this.previousVoiced = true;
      } else {
        if (!this.hasSpeech) this.speechMs = 0;
        this.previousVoiced = false;
      }
    } else {
      this.previousVoiced = false;
      if (!this.hasSpeech) this.speechMs = 0;
    }
    return this.check(now);
  }
  // Called by a separate clock as well as by meter samples. A stalled recorder
  // callback must not disable either the silence deadline or the turn limit.
  check(now: number): 'send' | 'silence' | 'review' | null {
    const elapsed = now - this.startTime;
    if (elapsed >= this.maxDurationMs) {
      if (!this.hasSpeech && !this.reliable) return 'review';
      return this.hasSpeech ? 'send' : 'silence';
    }
    // Estimate a pause only AFTER real speech has been confirmed. Missing data
    // alone must never turn an empty recording into an automatic upload.
    if (this.hasSpeech && elapsed >= this.settings.minimumTurnMs && now - this.lastSpeechTime >= this.settings.silenceMs
      && (!this.lastMeasurementVoiced || this.meteringUnavailable(now))) return 'send';
    if (!this.hasSpeech && elapsed >= this.settings.noSpeechMs) return this.reliable ? 'silence' : 'review';
    return null;
  }
}

export function isTranscriptionError(error: unknown) {
  const e = error as { code?: string; status?: number; data?: { code?: string; error?: { code?: string } } };
  const code = e?.data?.error?.code || e?.data?.code || e?.code || '';
  return /^(TRANSCRIPTION_FAILED|TRANSCRIPTION_ERROR|EMPTY_TRANSCRIPT|NO_SPEECH_DETECTED|SILENT_AUDIO|INVALID_AUDIO)$/.test(code) || e?.status === 422;
}

export function isCancelledError(error: unknown) {
  const e = error as { code?: string; name?: string };
  return e?.code === 'CANCELLED' || e?.code === 'REQUEST_CANCELLED' || e?.name === 'AbortError';
}

export function reconcileVoiceMessages(current: LuxMessage[], requestId: string, returned: LuxMessage[]) {
  const ids = new Set(returned.map((item) => item.id));
  const existing = current.filter((item) => item.clientRequestId !== requestId && !ids.has(item.id));
  return [...existing, ...returned.map((item) => ({ ...item, persisted: true }))];
}

export function voiceErrorMessage(error: unknown): string {
  const e = error as { code?: string; status?: number; name?: string; message?: string };
  if (e?.code === 'TIMEOUT' || e?.status === 408) return 'Lux tardó demasiado. Tu audio sigue disponible; reintentá con el mismo pedido o descartalo.';
  if (isCancelledError(error)) return 'Solicitud cancelada. Podés iniciar un turno nuevo.';
  if (e?.code === 'INVALID_CASE_ID') return 'La causa seleccionada no es válida. Seleccioná una causa válida antes de reintentar.';
  if (e?.code === 'CASE_NOT_FOUND') return 'La causa seleccionada no existe o no tenés acceso. Cambiá de causa para continuar.';
  if (e?.code === 'AUDIO_NOT_FOUND') return 'El audio ya no está disponible. Pedí nuevamente la voz desde la respuesta escrita.';
  if (e?.code === 'MESSAGE_NOT_FOUND') return 'Esta respuesta ya no está disponible para generar audio.';
  if (e?.code === 'REQUEST_IN_PROGRESS') return 'Lux todavía está procesando este turno. Esperá unos segundos y reintentá; se conservará el mismo pedido.';
  if (e?.status === 404) return 'La voz de Lux todavía no está habilitada en este servidor. Podés seguir usando el chat escrito.';
  if (e?.status === 401) return 'Tu sesión venció. Volvé a iniciar sesión.';
  if (e?.status === 403) return 'No tenés acceso a este audio o conversación.';
  if (e?.code === 'REQUEST_PREPARATION_ERROR') return 'No se pudo preparar el audio para enviarlo. Tu grabación sigue disponible para reintentar o descartar.';
  if (e?.code === 'NETWORK_ERROR' || e?.status === 0) return 'No se pudo conectar con Lux. Revisá internet; tu audio sigue disponible para reintentar.';
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') return 'El micrófono está bloqueado. Habilitá el permiso en la configuración del navegador o dispositivo.';
  if (e?.name === 'NotFoundError') return 'No encontramos un micrófono disponible. Podés seguir escribiendo.';
  if (e?.name === 'NotReadableError') return 'El micrófono está ocupado por otra aplicación. Liberalo y volvé a intentar.';
  return e?.message || 'No pudimos completar la operación de voz. Podés seguir escribiendo.';
}
