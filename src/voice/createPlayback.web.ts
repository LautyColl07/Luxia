import type { Playback } from './types';

export function createPlayback(): Playback {
  let audio: HTMLAudioElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    async play(resource, finished, failed) {
      const active = new Audio(resource.uri);
      audio = active;
      active.onended = finished;
      active.onerror = () => failed(new Error('No pudimos reproducir el audio. Volvé a pedirlo.'));
      active.oncanplay = () => clearTimeout(timer);
      timer = setTimeout(() => failed(new Error('No pudimos cargar el audio.')), 15000);
      try { await active.play(); } catch { throw new Error('El navegador bloqueó la reproducción. Tocá Reproducir para escuchar la respuesta.'); }
    },
    pause() { audio?.pause(); },
    async resume() { if (audio) await audio.play(); },
    async stop() {
      clearTimeout(timer);
      if (audio) {
        audio.pause(); audio.onended = null; audio.onerror = null; audio.oncanplay = null;
        audio.removeAttribute('src'); audio.load(); audio = null;
      }
    },
  };
}
