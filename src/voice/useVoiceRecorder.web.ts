import { useMemo } from 'react';
import { acceptsMime, baseMime } from './voicePolicy';
import type { Recorder, Recording } from './types';

export function createWebVoiceRecorder(): Recorder {
  let stream: MediaStream | null = null;
  let media: MediaRecorder | null = null;
  let audioContext: AudioContext | null = null;
  let interval: ReturnType<typeof setInterval> | undefined;
  let chunks: Blob[] = [];
  let startedAt = 0;
  let stopped: Promise<Recording> | null = null;
  let pending: Promise<void> | null = null;
  let recordingError: Error | null = null;
  let echoCancellationAvailable = false;
  const releaseMic = () => {
    clearInterval(interval);
    interval = undefined;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    const context = audioContext;
    audioContext = null;
    if (context) void context.close().catch(() => undefined);
  };
  const stop = (): Promise<Recording> => {
    if (stopped) return stopped;
    const active = media;
    if (!active) return Promise.reject(new Error('El micrófono no está grabando.'));
    const durationMs = Date.now() - startedAt;
    stopped = new Promise((resolve, reject) => {
      let completed = false;
      active.onstop = () => {
        if (completed) return;
        completed = true;
        media = null;
        // The encoder's actual MIME wins over the requested one.
        const mimeType = active.mimeType || chunks.find((chunk) => chunk.type)?.type;
        if (recordingError) { reject(recordingError); chunks = []; return; }
        if (!mimeType) { reject(new Error('El navegador no informó el formato del audio.')); chunks = []; return; }
        const blob = new Blob(chunks, { type: mimeType });
        chunks = [];
        const uri = URL.createObjectURL(blob);
        const extensions: Record<string, string> = { 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'video/webm': 'webm', 'audio/ogg': 'ogg' };
        resolve({ uri, blob, size: blob.size, durationMs, mimeType, name: `lux-recording.${extensions[baseMime(mimeType)] || 'audio'}`,
          dispose: async () => URL.revokeObjectURL(uri) });
      };
      if (active.state !== 'inactive') active.stop();
      else active.onstop(new Event('stop'));
    });
    releaseMic();
    return stopped;
  };
  return {
    get supportsMonitoring() { return echoCancellationAvailable; },
    start(cap, sample, signal, options) {
      if (pending || media) return Promise.reject(new Error('El micrófono ya está activo.'));
      const work = (async () => {
        if (!globalThis.isSecureContext) throw new Error('El micrófono necesita HTTPS o localhost. Abrí LuxIA en una dirección segura.');
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Este navegador no permite grabar audio. Podés seguir escribiendo.');
        const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']
          .find((candidate) => acceptsMime(cap, candidate) && MediaRecorder.isTypeSupported(candidate));
        if (!mime) throw new Error('Este navegador y el servidor no comparten un formato de audio compatible.');
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        echoCancellationAvailable = stream.getAudioTracks().some((track) => track.getSettings().echoCancellation === true);
        if (signal.aborted) { releaseMic(); return; }
        if (options?.monitoring && !echoCancellationAvailable) {
          releaseMic();
          throw new Error('Este micrófono no permite cancelar el eco durante la respuesta.');
        }
        try {
          chunks = []; stopped = null; recordingError = null;
          media = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64000 });
          media.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
          media.onerror = () => { recordingError = new Error('El navegador interrumpió la grabación. Volvé a grabar.'); releaseMic(); };
          // A muted source feeds an analyser, never the speakers.
          let analyser: AnalyserNode | null = null;
          try {
            audioContext = new AudioContext();
            await audioContext.resume();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            audioContext.createMediaStreamSource(stream).connect(analyser);
          } catch { if (audioContext) void audioContext.close().catch(() => undefined); audioContext = null; }
          if (signal.aborted) { media = null; releaseMic(); return; }
          const samples = new Float32Array(2048);
          startedAt = Date.now();
          media.start(250);
          interval = setInterval(() => {
            if (analyser && audioContext?.state === 'running') {
              analyser.getFloatTimeDomainData(samples);
              const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
              sample(20 * Math.log10(Math.max(rms, 0.000001)));
            } else sample(undefined);
          }, 100);
        } catch (error) { media = null; releaseMic(); throw error; }
      })();
      pending = work;
      return work.finally(() => { pending = null; });
    },
    stop,
    async dispose() {
      if (pending) await pending.catch(() => undefined);
      if (media) { const recording = await stop().catch(() => null); await recording?.dispose(); }
      releaseMic(); chunks = [];
    },
  };
}
export function useVoiceRecorder(): Recorder { return useMemo(createWebVoiceRecorder, []); }
