import { EndOfTurnDetector, isCancelledError, isTranscriptionError, VAD_SETTINGS, validateRecording, voiceErrorMessage } from './voicePolicy';
import type { VadSettings } from './voicePolicy';
import type { AudioResource, LuxMessage, Playback, Recorder, Recording, Speech, VoiceCapabilities, VoiceScope, VoiceTransport, VoiceTurn } from './types';

export type VoiceState = {
  status: 'inactive' | 'listening' | 'processing' | 'speaking' | 'error' | 'reviewing';
  capabilities: VoiceCapabilities | null;
  loadingCapabilities: boolean;
  conversation: boolean;
  microphoneActive: boolean;
  microphonePaused: boolean;
  speechDetected: boolean;
  monitoring: boolean;
  thresholdDb: number;
  starting: boolean;
  manual: boolean;
  muted: boolean;
  paused: boolean;
  playingId: string | null;
  durationMs: number;
  draft: Recording | null;
  error: string;
  transcript: string;
  answer: string;
  warnings: string[];
};
type Callbacks = {
  changed(state: VoiceState): void;
  pending(id: string, scope: VoiceScope): void;
  settled(id: string, scope: VoiceScope): void;
  turn(result: VoiceTurn, id: string, scope: VoiceScope): void;
  speech(message: LuxMessage, speech: Speech, scope: VoiceScope): void;
};

export class VoiceController {
  state: VoiceState = { status: 'inactive', capabilities: null, loadingCapabilities: false, conversation: false,
    microphoneActive: false, microphonePaused: false, speechDetected: false, monitoring: false, thresholdDb: VAD_SETTINGS.thresholdDb,
    starting: false, manual: false, muted: false, paused: false, playingId: null,
    durationMs: 0, draft: null, error: '', transcript: '', answer: '', warnings: [] };
  scope: VoiceScope | null = null;
  autoRead = false;
  private epoch = 0;
  private request: { id: string; controller: AbortController; scope?: VoiceScope; settled?: boolean } | null = null;
  private capture: AbortController | null = null;
  private capRequest: AbortController | null = null;
  private detector: EndOfTurnDetector | null = null;
  private captureTimer: ReturnType<typeof setTimeout> | null = null;
  private stoppingCapture = false;
  private listeningCount = 0;
  private startedAt = 0;
  private draftId: string | null = null;
  private draftResponseAudio = false;
  private playerEpoch = 0;
  private resource: AudioResource | null = null;
  private recordings = new Map<string, Recording>();
  private cleanup: Promise<void> = Promise.resolve();
  private monitor: AbortController | null = null;
  private monitorTask: Promise<void> | null = null;
  private monitorCleanup: Promise<void> = Promise.resolve();
  private playbackCleanup: Promise<void> = Promise.resolve();
  private vadSettings: VadSettings = { ...VAD_SETTINGS };
  constructor(private recorder: Recorder, private playback: Playback, private transport: VoiceTransport,
    private uuid: () => string, private callbacks: Callbacks, private now = Date.now) {}
  private patch(patch: Partial<VoiceState>) { this.state = { ...this.state, ...patch }; this.callbacks.changed(this.state); }
  // Temporary development diagnostics: only fixed event names and numeric/
  // boolean metadata. Never log recordings, URIs, transcripts or credentials.
  private log(event: string, metadata?: { durationMs: number; hasSpeech: boolean; meteringReliable: boolean }) {
    if (typeof __DEV__ !== 'undefined' && __DEV__ && this.state.conversation) {
      if (metadata) console.info(`[Lux Voice] ${event}`, metadata);
      else console.info(`[Lux Voice] ${event}`);
    }
  }
  private clearCaptureTimer() {
    if (this.captureTimer !== null) clearTimeout(this.captureTimer);
    this.captureTimer = null;
  }
  get busy() { return this.state.starting || ['listening', 'processing', 'speaking', 'reviewing'].includes(this.state.status); }
  get requestActive() { return !!this.request; }
  private live(epoch: number) { return this.epoch === epoch; }

  async loadCapabilities() {
    this.capRequest?.abort();
    const controller = new AbortController();
    this.capRequest = controller;
    this.patch({ loadingCapabilities: true, error: '' });
    try {
      const capabilities = await this.transport.capabilities(controller.signal);
      if (!controller.signal.aborted) this.patch({ capabilities,
        error: capabilities.enabled && capabilities.transcriptionAvailable ? '' : 'La transcripción de voz no está disponible. Podés seguir escribiendo.' });
    } catch (error) {
      if (!controller.signal.aborted) this.patch({ capabilities: null, error: voiceErrorMessage(error) });
    } finally {
      if (this.capRequest === controller) { this.capRequest = null; this.patch({ loadingCapabilities: false }); }
    }
  }

  async begin(scope: VoiceScope, conversation: boolean) {
    const cap = this.state.capabilities;
    if (!cap?.enabled || !cap.transcriptionAvailable) { this.patch({ error: 'La voz no está disponible. Revisá la conexión o seguí escribiendo.' }); return; }
    if (conversation && (this.state.draft || this.capture)) {
      this.patch({ error: 'Enviá o descartá la nota de voz antes de iniciar la conversación.' });
      return;
    }
    if (this.busy || this.state.draft || this.state.conversation) return;
    this.scope = { ...scope };
    this.listeningCount = 0;
    this.patch({ conversation, microphonePaused: false, muted: false, status: 'inactive', error: '', transcript: '', answer: '',
      warnings: conversation && !cap.synthesisAvailable ? ['La síntesis de voz no está disponible. Lux responderá por escrito y seguirá escuchando.'] : [] });
    this.log('call started');
    await this.listen();
  }
  async listen() {
    if (!this.scope || this.request || this.capture || this.stoppingCapture || this.resource || this.state.draft || this.state.starting || this.state.microphonePaused) return;
    const cap = this.state.capabilities;
    if (!cap) return;
    const epoch = this.epoch;
    this.patch({ starting: true });
    await this.cleanup;
    await this.stopPlayback();
    if (!this.live(epoch) || !this.scope) return;
    if (this.state.microphonePaused) { this.patch({ starting: false }); return; }
    const capture = new AbortController();
    this.capture = capture;
    // Bound duration by both server limits and the 64 kbit/s encoder budget.
    const maximumMs = Math.min(this.state.conversation ? this.vadSettings.maximumTurnMs : Infinity,
      cap.maxAudioDurationSeconds * 1000, Math.max(500, (cap.maxAudioBytes - 4096) / 9000 * 1000));
    this.startedAt = this.now();
    this.detector = new EndOfTurnDetector(this.startedAt, maximumMs, this.vadSettings);
    const update = (db?: number, measured = false) => {
      if (!this.live(epoch) || capture.signal.aborted || this.capture !== capture || this.state.status !== 'listening' || this.state.microphonePaused) return;
      const now = this.now();
      const detector = this.detector!;
      const hadSpeech = detector.hasSpeech;
      const wasSpeaking = detector.speaking;
      const decision = measured ? detector.sample(db, now) : detector.check(now);
      if (!hadSpeech && detector.hasSpeech) this.log('speech detected');
      if (measured && db !== undefined && Number.isFinite(db) && wasSpeaking && !detector.speaking) this.log('silence detected');
      this.patch({ durationMs: now - this.startedAt, manual: !this.state.conversation && detector.meteringUnavailable(now), speechDetected: detector.speaking });
      if (!this.state.conversation && now - this.startedAt < maximumMs) return;
      if (decision === 'send') {
        // The detector has already confirmed speech. No UI action is needed.
        if (detector.meteringUnavailable(now)) this.log('silence detected');
        this.log('auto submit turn', { durationMs: now - this.startedAt, hasSpeech: detector.hasSpeech, meteringReliable: !detector.meteringUnavailable(now) });
        void this.finishCapture(this.state.conversation);
      } else if (decision === 'silence' || (decision === 'review' && this.state.conversation)) {
        void this.finishCapture(false, true);
      } else if (decision === 'review') void this.finishCapture(false);
    };
    try {
      await this.recorder.start(cap, (db) => update(db, true), capture.signal);
      if (!this.live(epoch) || capture.signal.aborted) return;
      // Permission prompts are excluded from the turn's duration.
      this.startedAt = this.now();
      this.detector = new EndOfTurnDetector(this.startedAt, maximumMs, this.vadSettings);
      this.patch({ status: 'listening', microphoneActive: true, starting: false, durationMs: 0, manual: false, speechDetected: false });
      this.log(this.listeningCount++ === 0 ? 'listening started' : 'listening restarted');
      const tick = () => {
        this.captureTimer = null;
        update();
        if (this.live(epoch) && this.capture === capture && !capture.signal.aborted) this.captureTimer = setTimeout(tick, 100);
      };
      this.captureTimer = setTimeout(tick, 100);
    } catch (error) {
      this.clearCaptureTimer();
      if (this.capture === capture) this.capture = null;
      await this.recorder.dispose();
      if (this.live(epoch) && !capture.signal.aborted) this.patch({ status: 'error', microphoneActive: false, starting: false, error: voiceErrorMessage(error) });
    }
  }

  async finishCapture(send = false, silence = false) {
    if (this.state.status !== 'listening' || !this.capture) return;
    const epoch = this.epoch;
    this.clearCaptureTimer();
    this.capture.abort(); this.capture = null;
    this.stoppingCapture = true;
    const noSpeech = silence || (this.detector?.reliable && !this.detector.hasSpeech);
    const unavailable = !this.detector?.reliable;
    this.patch({ status: 'processing', microphoneActive: false, speechDetected: false });
    let recording: Recording | null = null;
    try {
      recording = await this.recorder.stop();
      this.stoppingCapture = false;
      if (!this.live(epoch)) { await recording.dispose(); return; }
      if (noSpeech) {
        await recording.dispose();
        this.patch({ status: 'inactive', error: this.state.conversation
          ? unavailable ? 'No recibimos mediciones del micrófono para confirmar voz. Volvemos a escuchar.' : ''
          : 'No detectamos voz suficiente. Tocá el micrófono para volver a hablar.' });
        if (this.state.conversation) await this.listen();
        return;
      }
      validateRecording(recording, this.state.capabilities!);
      this.draftId = this.uuid();
      // A temporary Piper outage must not block a call or prevent recovery on
      // its next turn. The backend commits text even when responseAudio fails.
      this.draftResponseAudio = this.state.conversation ? !this.state.muted : this.state.capabilities!.synthesisAvailable && this.autoRead;
      this.patch({ status: send ? 'processing' : 'reviewing', draft: recording, durationMs: recording.durationMs });
      if (send) await this.sendDraft();
    } catch (error) {
      this.stoppingCapture = false;
      if (!recording) await this.recorder.dispose().catch(() => undefined);
      if (recording && recording !== this.state.draft) await recording.dispose();
      if (this.live(epoch)) {
        this.patch({ status: 'error', error: voiceErrorMessage(error) });
        if (this.state.conversation && !this.state.draft) await this.listen();
      }
    }
  }
  async sendDraft() {
    const recording = this.state.draft;
    if (!recording || !this.scope || this.request || this.state.starting) return;
    const epoch = this.epoch;
    const scope = { ...this.scope };
    const id = this.draftId!;
    const operation = { id, controller: new AbortController(), scope, settled: false };
    this.request = operation;
    this.patch({ status: 'processing', error: '' });
    this.callbacks.pending(id, scope);
    try {
      await this.stopPlayback();
      if (!this.live(epoch) || operation.controller.signal.aborted) return;
      this.log('sending voice turn');
      const result = await this.transport.turn(recording, id, scope, this.state.conversation ? 'conversation' : 'message', this.draftResponseAudio, operation.controller.signal);
      if (!this.live(epoch) || operation.controller.signal.aborted) return;
      this.log('backend response received');
      this.scope = { ...scope, conversationId: result.conversationId };
      this.recordings.set(result.userMessage.id, recording);
      this.callbacks.turn(result, id, scope);
      this.draftId = null;
      this.patch({ draft: null, transcript: result.transcript, answer: result.assistantMessage.text, warnings: result.warnings, status: 'inactive' });
      this.request = null;
      if (result.speech.status === 'ready' && result.speech.audioId && this.draftResponseAudio && !this.state.muted) {
        await this.playAudio(result.speech.audioId, result.assistantMessage.id);
      } else {
        if (this.draftResponseAudio && result.speech.status !== 'ready') this.patch({ warnings: [...result.warnings, 'La respuesta está escrita. Podés volver a pedir su audio desde el chat.'] });
        if (this.state.conversation) await this.listen();
      }
    } catch (error) {
      if (this.live(epoch) && !operation.controller.signal.aborted) {
        if (isCancelledError(error) || (this.state.conversation && isTranscriptionError(error))) {
          if (this.request === operation) this.request = null;
          this.draftId = null;
          this.patch({ draft: null, status: 'inactive', error: isCancelledError(error) ? 'Solicitud cancelada.' : 'No pudimos transcribir lo que dijiste. Te escucho de nuevo.' });
          await recording.dispose();
          if (this.live(epoch) && this.state.conversation) await this.listen();
        } else this.patch({ status: 'error', error: voiceErrorMessage(error) });
      }
    } finally {
      if (!operation.settled) { operation.settled = true; this.callbacks.settled(id, scope); }
      if (this.request === operation) this.request = null;
    }
  }
  async discard() {
    if (this.request) return;
    const epoch = this.epoch;
    await this.stopPlayback();
    if (!this.live(epoch)) return;
    const draft = this.state.draft;
    this.draftId = null;
    this.patch({ draft: null, status: 'inactive', error: '', durationMs: 0 });
    await draft?.dispose();
    if (this.state.conversation) await this.listen();
  }
  hasLocalAudio(messageId: string) { return this.recordings.has(messageId); }
  async preview() {
    if (!this.state.draft || this.request) return;
    if (this.state.playingId === 'draft') { await this.togglePause(); return; }
    const recording = this.state.draft;
    await this.playResource({ uri: recording.uri, dispose: async () => undefined }, 'draft');
  }
  async playMessage(message: LuxMessage) {
    if (this.capture || this.request || this.state.starting || this.state.conversation || this.state.draft) return;
    if (this.state.playingId === message.id) { await this.togglePause(); return; }
    const local = this.recordings.get(message.id);
    if (local) { await this.playResource({ uri: local.uri, dispose: async () => undefined }, message.id); return; }
    const audioId = message.audio?.audioId || message.speech?.audioId;
    if (audioId) { await this.playAudio(audioId, message.id); return; }
    await this.generateSpeech(message);
  }
  async generateSpeech(message: LuxMessage) {
    if (!this.scope || this.capture || this.request || this.state.starting || this.state.draft) return;
    if (!this.state.capabilities?.synthesisAvailable) { this.patch({ error: 'La voz de Lux no está disponible. La respuesta escrita sigue accesible.' }); return; }
    if (!message.persisted && /^(assistant-|user-)/.test(message.id)) { this.patch({ error: 'Esta respuesta sólo está guardada localmente. El servidor debe devolver su messageId para generar audio.' }); return; }
    const epoch = this.epoch;
    const operation = { id: this.uuid(), controller: new AbortController() };
    this.request = operation;
    this.patch({ status: 'processing', error: '' });
    try {
      await this.stopPlayback();
      if (!this.live(epoch) || operation.controller.signal.aborted) return;
      const speech = await this.transport.speech(message.id, operation.id, operation.controller.signal);
      if (!this.live(epoch) || operation.controller.signal.aborted) return;
      this.callbacks.speech(message, speech, this.scope);
      this.request = null;
      this.patch({ status: 'inactive' });
      if (speech.status === 'ready' && speech.audioId) await this.playAudio(speech.audioId, message.id);
      else this.patch({ status: 'error', error: 'La síntesis no está disponible. Conservamos la respuesta escrita; podés pedir el audio otra vez.' });
    } catch (error) {
      if (this.live(epoch) && !operation.controller.signal.aborted) this.patch({ status: 'error', error: voiceErrorMessage(error) });
    } finally { if (this.request === operation) this.request = null; }
  }
  private async playAudio(audioId: string, messageId: string) {
    const epoch = this.epoch;
    const operation = { id: '', controller: new AbortController() };
    this.request = operation;
    this.patch({ status: 'processing' });
    try {
      await this.stopPlayback();
      if (!this.live(epoch) || operation.controller.signal.aborted) return;
      const resource = await this.transport.audio(audioId, operation.controller.signal);
      if (!this.live(epoch) || operation.controller.signal.aborted) { await resource.dispose(); return; }
      this.request = null;
      await this.playResource(resource, messageId);
    } catch (error) {
      if (this.live(epoch) && !operation.controller.signal.aborted) {
        this.patch({ status: 'error', error: voiceErrorMessage(error) });
        if (this.request === operation) this.request = null;
        if (this.state.conversation) await this.listen();
      }
    } finally { if (this.request === operation) this.request = null; }
  }
  private async playResource(resource: AudioResource, id: string) {
    const epoch = this.epoch;
    await this.stopPlayback();
    if (!this.live(epoch)) { await resource.dispose(); return; }
    const playerEpoch = ++this.playerEpoch;
    this.resource = resource;
    this.patch({ status: 'speaking', playingId: id, paused: false });
    this.log('playing assistant audio');
    const fail = async (error: unknown) => {
      if (!this.live(epoch) || playerEpoch !== this.playerEpoch) return;
      await this.stopPlayback();
      if (this.live(epoch)) {
        this.patch({ status: 'error', error: voiceErrorMessage(error) });
        if (this.state.conversation) await this.listen();
      }
    };
    try {
      await this.playback.play(resource, () => {
        if (!this.live(epoch) || playerEpoch !== this.playerEpoch) return;
        this.log('playback ended');
        void (async () => {
          await this.stopPlayback();
          if (!this.live(epoch)) return;
          this.patch({ status: this.state.draft ? 'reviewing' : 'inactive' });
          if (this.state.conversation) await this.listen();
        })();
      }, (error) => { void fail(error); }, { duplex: !!this.recorder.supportsMonitoring && this.state.conversation && !this.state.microphonePaused });
      if (this.live(epoch) && playerEpoch === this.playerEpoch) await this.startMonitoring(epoch, playerEpoch);
    } catch (error) { await fail(error); }
  }
  private async startMonitoring(epoch: number, playerEpoch: number) {
    await this.monitorCleanup.catch(() => undefined);
    if (!this.live(epoch) || playerEpoch !== this.playerEpoch) return;
    if (!this.recorder.supportsMonitoring || !this.state.conversation || this.state.microphonePaused || this.monitor || !this.state.capabilities) return;
    const monitor = new AbortController();
    this.monitor = monitor;
    const startedAt = this.now();
    // Require sustained, louder near-field speech after the output settles.
    const detector = new EndOfTurnDetector(startedAt + 300, Infinity,
      { ...this.vadSettings, thresholdDb: Math.max(-32, this.vadSettings.thresholdDb + 10) });
    this.monitorTask = this.recorder.start(this.state.capabilities, (db) => {
      if (!this.live(epoch) || playerEpoch !== this.playerEpoch || monitor.signal.aborted || this.now() < startedAt + 300) return;
      detector.sample(db, this.now());
      if (detector.hasSpeech) void this.interrupt();
    }, monitor.signal, { monitoring: true });
    try {
      await this.monitorTask;
      if (this.live(epoch) && playerEpoch === this.playerEpoch && !monitor.signal.aborted) this.patch({ monitoring: true });
    } catch {
      // Playback and the explicit interrupt control still work without a monitor.
      if (this.monitor === monitor) await this.stopMonitoring();
    } finally { this.monitorTask = null; }
  }
  private stopMonitoring() {
    const monitor = this.monitor;
    if (!monitor) return this.monitorCleanup;
    monitor.abort(); this.monitor = null;
    const task = this.monitorTask;
    this.patch({ monitoring: false });
    this.monitorCleanup = this.monitorCleanup.catch(() => undefined).then(async () => {
      await task?.catch(() => undefined);
      await this.recorder.dispose();
    });
    return this.monitorCleanup;
  }
  private stopPlayback() {
    ++this.playerEpoch;
    const resource = this.resource; this.resource = null;
    this.patch({ playingId: null, paused: false });
    this.playbackCleanup = this.playbackCleanup.catch(() => undefined).then(async () => {
      await this.stopMonitoring().catch(() => undefined);
      try { await this.playback.stop(); } finally { await resource?.dispose(); }
    });
    return this.playbackCleanup;
  }
  async togglePause() {
    if (!this.resource) return;
    try {
      if (this.state.paused) { await this.playback.resume(); this.patch({ paused: false }); }
      else { this.playback.pause(); this.patch({ paused: true }); }
    } catch (error) { await this.stopPlayback(); this.patch({ status: 'error', error: voiceErrorMessage(error) }); }
  }
  async interrupt() {
    if (!this.state.conversation || this.state.status !== 'speaking') return;
    const epoch = this.epoch;
    this.patch({ status: 'processing' });
    await this.stopPlayback();
    if (this.live(epoch) && this.state.conversation) { this.patch({ status: 'inactive' }); await this.listen(); }
  }
  async toggleMute() {
    this.patch({ muted: !this.state.muted });
    if (this.state.muted && this.state.status === 'speaking' && this.state.conversation) await this.interrupt();
  }
  async pauseListening() {
    const epoch = this.epoch;
    if (this.state.conversation) this.patch({ microphonePaused: true });
    await this.stopMonitoring();
    if (!this.live(epoch) || !this.capture) return;
    this.clearCaptureTimer();
    this.capture?.abort(); this.capture = null;
    this.patch({ status: 'processing', microphoneActive: false, starting: false, speechDetected: false });
    await this.recorder.dispose();
    if (this.live(epoch)) {
      this.patch({ status: 'inactive' });
      if (this.state.conversation && !this.state.microphonePaused) await this.listen();
    }
  }
  async toggleMicrophone() {
    if (!this.state.conversation) return;
    if (!this.state.microphonePaused) { await this.pauseListening(); return; }
    this.patch({ microphonePaused: false, error: '' });
    // A resumed turn waits for playback completion. Only the echo-protected
    // interruption monitor may use the microphone while Lux speaks.
    if (['inactive', 'error'].includes(this.state.status)) await this.listen();
    else if (this.state.status === 'speaking') await this.startMonitoring(this.epoch, this.playerEpoch);
  }
  setThreshold(thresholdDb: number) {
    if (!Number.isFinite(thresholdDb)) return;
    this.vadSettings.thresholdDb = Math.max(-60, Math.min(-20, thresholdDb));
    this.patch({ thresholdDb: this.vadSettings.thresholdDb });
  }
  cancelRequest(resume = true) {
    const request = this.request;
    if (!request) return;
    request.controller.abort(); this.request = null;
    if (request.id) {
      void this.transport.cancel(request.id).catch(() => undefined);
      if (request.scope && !request.settled) { request.settled = true; this.callbacks.settled(request.id, request.scope); }
    }
    // DELETE permanently invalidates this ID on the server. A cancelled
    // upload is discarded; only failures without cancellation are retryable.
    const draft = request.scope ? this.state.draft : null;
    if (draft) {
      this.draftId = null;
      this.cleanup = this.cleanup.catch(() => undefined).then(() => draft.dispose());
    }
    this.patch({ ...(draft ? { draft: null } : {}), status: this.state.draft && !draft ? 'reviewing' : 'inactive', error: 'Solicitud cancelada.' });
    if (resume && this.state.conversation && !this.state.draft) void this.listen();
  }
  close() {
    ++this.epoch;
    this.clearCaptureTimer();
    this.capRequest?.abort(); this.capRequest = null;
    this.capture?.abort(); this.capture = null;
    this.cancelRequest(false);
    const draft = this.state.draft;
    const recordings = [...this.recordings.values()]; this.recordings.clear();
    this.draftId = null;
    this.scope = null;
    this.monitor?.abort();
    this.patch({ status: 'inactive', conversation: false, microphoneActive: false, microphonePaused: false, speechDetected: false, monitoring: false, starting: false, draft: null,
      playingId: null, paused: false, muted: false, manual: false, loadingCapabilities: false, durationMs: 0, error: '', warnings: [], transcript: '', answer: '' });
    this.cleanup = this.cleanup.catch(() => undefined).then(async () => {
      await this.stopPlayback().catch(() => undefined);
      await Promise.allSettled([this.recorder.dispose(), draft?.dispose(), ...recordings.map((recording) => recording.dispose())]);
    });
    return this.cleanup;
  }
}
