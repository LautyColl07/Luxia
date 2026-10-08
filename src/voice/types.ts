export type VoiceCapabilities = {
  enabled: boolean;
  transcriptionAvailable: boolean;
  synthesisAvailable: boolean;
  voiceId: string | null;
  language: string;
  maxAudioBytes: number;
  maxAudioDurationSeconds: number;
  acceptedMimeTypes: string[];
};
export type Speech = {
  status: 'ready' | 'unavailable';
  errorCode?: string | null;
  text: string;
  audioId: string | null;
  mimeType: string | null;
  durationMs: number | null;
};
export type LuxMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  clientRequestId?: string;
  persisted?: boolean;
  audio?: { audioId?: string | null; mimeType?: string | null; durationMs?: number | null } | null;
  speech?: Speech;
  citations?: Record<string, unknown>[];
  documents?: Record<string, unknown>[];
  [key: string]: unknown;
};
export type VoiceTurn = {
  requestId: string;
  clientRequestId?: string;
  status: 'completed' | 'completed_with_synthesis_error';
  mode: 'message' | 'conversation';
  conversationId: string;
  transcript: string;
  response: string;
  citations: Record<string, unknown>[];
  documentsUsed: Record<string, unknown>[];
  timings: Record<string, number | null>;
  userMessage: LuxMessage;
  assistantMessage: LuxMessage;
  speech: Speech;
  warnings: string[];
};
export type VoiceScope = {
  localConversationId: string;
  conversationId?: string | null;
  caseId?: string | number | null;
};
export type Recording = {
  uri: string;
  mimeType: string;
  name: string;
  size: number;
  durationMs: number;
  blob?: Blob;
  dispose(): Promise<void>;
};
export type AudioResource = { uri: string; dispose(): Promise<void> };
export type Recorder = {
  supportsMonitoring?: boolean;
  start(capabilities: VoiceCapabilities, sample: (db: number | undefined) => void, signal: AbortSignal, options?: { monitoring: boolean }): Promise<void>;
  stop(): Promise<Recording>;
  dispose(): Promise<void>;
};
export type Playback = {
  play(resource: AudioResource, finished: () => void, failed: (error: unknown) => void, options?: { duplex: boolean }): Promise<void>;
  pause(): void;
  resume(): Promise<void>;
  stop(): Promise<void>;
};
export type VoiceTransport = {
  capabilities(signal: AbortSignal): Promise<VoiceCapabilities>;
  turn(recording: Recording, id: string, scope: VoiceScope, mode: 'message' | 'conversation', responseAudio: boolean, signal: AbortSignal): Promise<VoiceTurn>;
  speech(messageId: string, id: string, signal: AbortSignal): Promise<Speech>;
  audio(audioId: string, signal: AbortSignal): Promise<AudioResource>;
  cancel(id: string): Promise<unknown>;
};
