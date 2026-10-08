import { File, FileMode } from 'expo-file-system';
import type { Recording } from './types';

export function createNativeRecording(file: File, durationMs: number): Recording {
  if (!/^(file|content):\/\//i.test(file.uri)) {
    throw new Error('La grabación devolvió una URI que iOS/Android no puede adjuntar.');
  }
  if (!file.exists) throw new Error('El archivo grabado ya no existe en el dispositivo.');
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new Error('La grabación está vacía. Volvé a grabar.');
  }

  const handle = file.open(FileMode.ReadOnly);
  try {
    if (!handle.readBytes(Math.min(file.size, 16)).byteLength) {
      throw new Error('La grabación no contiene bytes legibles.');
    }
  } finally {
    handle.close();
  }

  const name = /\.(m4a|mp4)$/i.test(file.name) ? file.name : `lux-voice-${Date.now()}.m4a`;
  return {
    uri: file.uri,
    name,
    mimeType: 'audio/mp4',
    size: file.size,
    durationMs,
    dispose: async () => { if (file.exists) file.delete(); },
  };
}
