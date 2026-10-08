import { File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import type { AudioResource } from './types';

export async function materializeAudio(bytes: Uint8Array, mime: string): Promise<AudioResource> {
  const extensions: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'application/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/webm': 'webm', 'video/webm': 'webm' };
  const file = new File(Paths.cache, `lux-voice-${randomUUID()}.${extensions[mime] || 'audio'}`);
  try { file.write(bytes); } catch (error) { if (file.exists) file.delete(); throw error; }
  return { uri: file.uri, dispose: async () => { if (file.exists) file.delete(); } };
}
