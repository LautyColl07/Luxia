import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer, AudioStatus } from 'expo-audio';
import type { Playback } from './types';

export function createPlayback(): Playback {
  let player: AudioPlayer | null = null;
  let subscription: { remove(): void } | null = null;
  let loadingTimer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  return {
    async play(resource, finished, failed, options) {
      const current = ++generation;
      // Duplex responses use the receiver, avoiding Lux's speaker audio in VAD.
      await setAudioModeAsync({ allowsRecording: !!options?.duplex, shouldRouteThroughEarpiece: !!options?.duplex,
        playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'doNotMix' });
      if (current !== generation) return;
      const active = createAudioPlayer(resource.uri, { updateInterval: 100 });
      player = active;
      loadingTimer = setTimeout(() => failed(new Error('No pudimos cargar el audio. Volvé a pedirlo.')), 15000);
      // createAudioPlayer exposes EventEmitter methods at runtime; the public
      // AudioPlayer declaration in SDK 57 omits the inherited member unless
      // apps install Expo's internal core package directly.
      const eventPlayer = active as AudioPlayer & {
        addListener(event: 'playbackStatusUpdate', listener: (status: AudioStatus) => void): { remove(): void };
      };
      subscription = eventPlayer.addListener('playbackStatusUpdate', (status) => {
        if (player !== active) return;
        if (status.isLoaded) clearTimeout(loadingTimer);
        if (status.error) failed(new Error(status.error));
        else if (status.didJustFinish) finished();
      });
      active.play();
    },
    pause() { player?.pause(); },
    async resume() { player?.play(); },
    async stop() {
      ++generation;
      clearTimeout(loadingTimer);
      subscription?.remove(); subscription = null;
      const active = player; player = null;
      if (active) { active.pause(); active.remove(); }
    },
  };
}
