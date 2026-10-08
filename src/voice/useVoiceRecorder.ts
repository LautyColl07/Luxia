import { useMemo } from 'react';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { File } from 'expo-file-system';
import { acceptsMime } from './voicePolicy';
import { createNativeRecording } from './nativeRecording';
import type { Recorder, Recording } from './types';

const OPTIONS = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000, isMeteringEnabled: true,
  android: { ...RecordingPresets.HIGH_QUALITY.android, audioSource: 'voice_communication' as const } };
export function useVoiceRecorder(): Recorder {
  const recorder = useAudioRecorder(OPTIONS);
  return useMemo(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    let pending: Promise<void> | null = null;
    let startedAt = 0;
    let prepared = false;
    let stopping: Promise<Recording> | null = null;
    const clear = () => { clearInterval(interval); interval = undefined; };
    const stop = () => {
      if (stopping) return stopping;
      stopping = (async () => {
        clear();
        const durationMs = Math.max(0, Date.now() - startedAt);
        await recorder.stop();
        prepared = false;
        await setAudioModeAsync({ allowsRecording: false });
        if (!recorder.uri) throw new Error('No encontramos el archivo de audio.');
        const file = new File(recorder.uri);
        try {
          return createNativeRecording(file, durationMs);
        } catch (error) {
          if (file.exists) file.delete();
          throw error;
        }
      })();
      return stopping;
    };
    return {
      supportsMonitoring: true,
      start(cap, sample, signal, options) {
        if (pending || prepared) return Promise.reject(new Error('El micrófono ya está activo.'));
        if (!acceptsMime(cap, 'audio/mp4')) return Promise.reject(new Error('El servidor no acepta audio MP4/AAC de este dispositivo. Podés seguir escribiendo.'));
        stopping = null;
        const work = (async () => {
          const permission = await requestRecordingPermissionsAsync();
          if (signal.aborted) return;
          if (!permission.granted) throw new Error('Permiso de micrófono denegado. Habilitalo en los ajustes del dispositivo.');
          await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false, allowsBackgroundRecording: false,
            shouldRouteThroughEarpiece: !!options?.monitoring, interruptionMode: 'doNotMix' });
          if (signal.aborted) { await setAudioModeAsync({ allowsRecording: false }); return; }
          await recorder.prepareToRecordAsync(OPTIONS);
          prepared = true;
          if (signal.aborted) return;
          startedAt = Date.now();
          recorder.record();
          interval = setInterval(() => {
            try {
              const status = recorder.getStatus();
              sample(status.isRecording ? status.metering : undefined);
            } catch { sample(undefined); }
          }, 100);
        })();
        pending = work;
        return work.finally(() => { pending = null; });
      },
      stop,
      async dispose() {
        clear();
        if (pending) await pending.catch(() => undefined);
        if (prepared) { const recording = await stop().catch(() => null); await recording?.dispose(); }
        await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      },
    };
  }, [recorder]);
}
