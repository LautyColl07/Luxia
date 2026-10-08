import type { AudioResource } from './types';

export async function materializeAudio(bytes: Uint8Array, mime: string): Promise<AudioResource> {
  const uri = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
  return { uri, dispose: async () => URL.revokeObjectURL(uri) };
}
