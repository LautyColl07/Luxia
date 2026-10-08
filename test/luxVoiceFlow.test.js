const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');

function loadTypeScript(relativePath, dependencies = {}, globals = {}) {
  const filename = path.join(root, relativePath);
  const transformed = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    plugins: [
      ['@babel/plugin-transform-typescript', { allowDeclareFields: true }],
      '@babel/plugin-transform-modules-commonjs',
    ],
  }).code;
  const module = { exports: {} };
  vm.runInNewContext(transformed, {
    AbortController,
    Date,
    Error,
    Map,
    Math,
    Number,
    Object,
    Promise,
    Set,
    String,
    clearInterval,
    clearTimeout,
    console,
    exports: module.exports,
    module,
    require(request) {
      if (Object.prototype.hasOwnProperty.call(dependencies, request)) return dependencies[request];
      throw new Error(`Módulo no esperado en prueba de voz: ${request}`);
    },
    setInterval,
    setTimeout,
    ...globals,
  });
  return module.exports;
}

const policy = loadTypeScript('src/voice/voicePolicy.ts');
// Keep test-created capture clocks from keeping Node alive after a failed test.
const testTimeout = (...args) => { const timer = setTimeout(...args); timer.unref(); return timer; };
const { VoiceController } = loadTypeScript('src/voice/VoiceController.ts', { './voicePolicy': policy }, { setTimeout: testTimeout });

function capabilities(overrides = {}) {
  return {
    enabled: true,
    transcriptionAvailable: true,
    synthesisAvailable: true,
    voiceId: 'lux',
    language: 'es-AR',
    maxAudioBytes: 2_000_000,
    maxAudioDurationSeconds: 30,
    acceptedMimeTypes: ['audio/webm', 'audio/mp4'],
    ...overrides,
  };
}

function recording(overrides = {}) {
  let disposed = false;
  return {
    uri: 'file:///turn.m4a',
    mimeType: 'audio/mp4',
    name: 'turn.m4a',
    size: 12_000,
    durationMs: 1_500,
    dispose: async () => { disposed = true; },
    get disposed() { return disposed; },
    ...overrides,
  };
}

function voiceTurn(id, speech = { status: 'unavailable', text: 'Respuesta', audioId: null, mimeType: null, durationMs: null }) {
  return {
    requestId: id,
    conversationId: 'remote-conversation',
    transcript: 'Consulta hablada',
    userMessage: { id: 'user-persisted', role: 'user', text: 'Consulta hablada', createdAt: new Date().toISOString() },
    assistantMessage: { id: 'assistant-persisted', role: 'assistant', text: 'Respuesta', createdAt: new Date().toISOString() },
    speech,
    warnings: [],
  };
}

function harness({ turn, speech, audio, play, clock, monitoring = false, cap, timers, logs, stop } = {}) {
  let active = false;
  let stopped = 0;
  let currentRecording = recording();
  const recordings = [];
  const events = [];
  const recorder = {
    supportsMonitoring: monitoring,
    async start(_cap, sample, _signal, options) {
      if (recordings.length) currentRecording = recording();
      recordings.push(currentRecording);
      active = true; recorder.sample = sample;
      events.push([options?.monitoring ? 'monitor-start' : 'capture-start']);
    },
    async stop() { active = false; stopped += 1; return stop ? stop(currentRecording) : currentRecording; },
    async dispose() { if (active) await currentRecording.dispose(); active = false; events.push(['capture-dispose']); },
  };
  const playback = {
    async play(resource, finished, failed, options) { events.push(['play', resource.uri, active, options]); if (play) await play(resource, finished, failed, options); },
    pause() { events.push(['pause']); },
    async resume() { events.push(['resume']); },
    async stop() { events.push(['stop']); },
  };
  const ids = [];
  const transport = {
    async capabilities() { return capabilities(cap); },
    async turn(rec, id, scope, mode, wantsAudio, signal) {
      ids.push(id);
      return turn ? turn(rec, id, scope, mode, wantsAudio, signal) : voiceTurn(id);
    },
    async speech(messageId, id, signal) { return speech ? speech(messageId, id, signal) : voiceTurn(id).speech; },
    async audio(audioId, signal) { return audio ? audio(audioId, signal) : { uri: 'file:///answer.mp3', dispose: async () => events.push(['dispose-audio']) }; },
    async cancel(id) { events.push(['cancel', id]); },
  };
  const callbacks = {
    changed(state) { events.push(['state', state.status]); },
    pending(id) { events.push(['pending', id]); },
    settled(id) { events.push(['settled', id]); },
    turn(result, id) { events.push(['turn', id, result.transcript]); },
    speech() {},
  };
  let nextId = 0;
  const Controller = timers || logs ? loadTypeScript('src/voice/VoiceController.ts', { './voicePolicy': policy }, {
    setTimeout: timers?.setTimeout || testTimeout, clearTimeout: timers?.clearTimeout || clearTimeout,
    __DEV__: !!logs, console: logs ? { info: (...args) => logs.push(args) } : console,
  }).VoiceController : VoiceController;
  const controller = new Controller(recorder, playback, transport, () => `request-${++nextId}`, callbacks, clock || Date.now);
  test.after(() => controller.close());
  return { controller, recorder, playback, get currentRecording() { return currentRecording; }, recordings, events, ids, get active() { return active; }, get stopped() { return stopped; } };
}

test('el VAD local espera voz mínima y silencio sostenido', () => {
  const detector = new policy.EndOfTurnDetector(0, 30_000);
  assert.equal(detector.sample(-20, 100), null);
  assert.equal(detector.sample(-20, 300), null);
  assert.equal(detector.sample(-20, 500), null);
  assert.equal(detector.sample(-20, 600), null);
  assert.equal(detector.hasSpeech, true);
  assert.equal(detector.sample(-70, 1_900), 'send');
});

test('sin metering ni voz confirmada el detector cierra al límite sin autorizar un envío', () => {
  const detector = new policy.EndOfTurnDetector(0, 1_000);
  assert.equal(detector.sample(undefined, 1_001), 'review');
  assert.equal(detector.reliable, false);
});

test('la validación usa el MIME real y los límites informados por backend', () => {
  assert.doesNotThrow(() => policy.validateRecording(recording(), capabilities()));
  assert.throws(() => policy.validateRecording(recording({ mimeType: 'audio/ogg' }), capabilities()), /no acepta el formato/);
  assert.throws(() => policy.validateRecording(recording({ size: 3_000_000 }), capabilities()), /supera el límite/);
  assert.throws(() => policy.validateRecording(recording({ durationMs: 100 }), capabilities()), /demasiado corta/);
  assert.throws(() => policy.validateRecording(recording({ uri: '' }), capabilities()), /archivo de audio válido/);
  assert.throws(() => policy.validateRecording(recording({ blob: { size: 0 } }), capabilities()), /archivo de audio válido/);
});

test('un turno graba, permite revisar y reconcilia mensajes persistidos', async () => {
  const h = harness();
  await h.controller.loadCapabilities();
  await h.controller.begin({ localConversationId: 'local-1', caseId: 'case-1' }, false);
  assert.equal(h.controller.state.status, 'listening');
  await h.controller.finishCapture(false);
  assert.equal(h.controller.state.status, 'reviewing');
  await h.controller.sendDraft();
  assert.equal(h.controller.state.status, 'inactive');
  assert.equal(h.controller.state.draft, null);
  assert.equal(h.stopped, 1);
  assert.equal(h.events.filter((event) => event[0] === 'turn').length, 1);
});

test('un fallo conserva audio y clientRequestId para un reintento deduplicable', async () => {
  let attempt = 0;
  const h = harness({ turn: async (_rec, id) => {
    attempt += 1;
    if (attempt === 1) { const error = new Error('sin red'); error.code = 'NETWORK_ERROR'; throw error; }
    return voiceTurn(id);
  } });
  await h.controller.loadCapabilities();
  await h.controller.begin({ localConversationId: 'local-1' }, false);
  await h.controller.finishCapture(false);
  await h.controller.sendDraft();
  assert.equal(h.controller.state.status, 'error');
  assert.ok(h.controller.state.draft);
  await h.controller.sendDraft();
  assert.deepEqual(h.ids, ['request-1', 'request-1']);
  assert.equal(h.controller.state.draft, null);
});

test('un doble toque no crea envíos simultáneos', async () => {
  let resolveTurn;
  const delayed = new Promise((resolve) => { resolveTurn = resolve; });
  const h = harness({ turn: async () => delayed });
  await h.controller.loadCapabilities();
  await h.controller.begin({ localConversationId: 'local-1' }, false);
  await h.controller.finishCapture(false);

  const first = h.controller.sendDraft();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await h.controller.sendDraft();
  assert.deepEqual(Array.from(h.ids), ['request-1']);

  resolveTurn(voiceTurn('request-1'));
  await first;
  assert.equal(h.events.filter((event) => event[0] === 'turn').length, 1);
});

test('conversación detiene captura antes de reproducir y no escucha a Lux', async () => {
  const ready = { status: 'ready', text: 'Respuesta', audioId: 'audio-1', mimeType: 'audio/mpeg', durationMs: 900 };
  const h = harness({ turn: async (_rec, id) => voiceTurn(id, ready) });
  await h.controller.loadCapabilities();
  await h.controller.begin({ localConversationId: 'local-1' }, true);
  await h.controller.finishCapture(true);
  const play = h.events.find((event) => event[0] === 'play');
  assert.ok(play);
  assert.equal(play[2], false);
  assert.equal(h.controller.state.microphoneActive, false);
  assert.equal(h.controller.state.status, 'speaking');
});

const readySpeech = { status: 'ready', text: 'Respuesta', audioId: 'audio-1', mimeType: 'audio/mpeg', durationMs: 900 };
const flushPlayback = () => new Promise((resolve) => setImmediate(resolve));

async function automaticHarness(options = {}) {
  let now = 0;
  const h = harness({ ...options, clock: () => now });
  await h.controller.loadCapabilities();
  await h.controller.begin({ localConversationId: 'same-chat' }, true);
  h.sample = async (db, ms = 100) => { now += ms; h.recorder.sample(db); await flushPlayback(); };
  h.say = async () => {
    for (let i = 0; i < 7; i += 1) await h.sample(-20);
    assert.equal(h.controller.state.speechDetected, true);
    for (let i = 0; i < 12; i += 1) await h.sample(-70);
  };
  return h;
}

function captureClock() {
  let now = 0;
  let nextId = 0;
  const jobs = new Map();
  return {
    now: () => now,
    timers: {
      setTimeout(callback, delay) { const id = ++nextId; jobs.set(id, { callback, at: now + delay }); return id; },
      clearTimeout(id) { jobs.delete(id); },
    },
    async advance(ms) {
      const target = now + ms;
      while (true) {
        const due = [...jobs].filter(([, job]) => job.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at; jobs.delete(due[0]); due[1].callback();
        await flushPlayback();
      }
      now = target;
      await flushPlayback();
    },
    get pending() { return jobs.size; },
  };
}

async function timedHarness(options = {}) {
  const clock = captureClock();
  const h = harness({ ...options, clock: clock.now, timers: clock.timers });
  await h.controller.loadCapabilities();
  await h.controller.begin({ localConversationId: 'same-chat' }, true);
  h.clock = clock;
  h.sayWithoutSilenceSamples = async () => {
    for (let i = 0; i < 7; i += 1) { await clock.advance(100); h.recorder.sample(-20); }
  };
  return h;
}

test('450 ms de voz confirman habla y el cierre espera exactamente 1200 ms de silencio', () => {
  const detector = new policy.EndOfTurnDetector(0, 45000);
  for (let now = 0; now < 450; now += 50) detector.sample(-20, now);
  assert.equal(detector.hasSpeech, false);
  detector.sample(-20, 450);
  assert.equal(detector.hasSpeech, true);
  detector.sample(-70, 550);
  assert.equal(detector.check(1649), null);
  assert.equal(detector.check(1650), 'send');
});

test('un intervalo sin muestras no se acumula como voz real', () => {
  const detector = new policy.EndOfTurnDetector(0, 45000);
  detector.sample(-20, 100); detector.sample(-20, 300);
  detector.sample(-20, 2000); detector.sample(-20, 2100);
  assert.equal(detector.hasSpeech, false);
  assert.equal(detector.check(12000), 'silence');
});

test('el reloj envía después de silencio aunque dejen de llegar callbacks del grabador', async (t) => {
  let resolveTurn;
  const h = await timedHarness({ turn: (_r, id) => new Promise((resolve) => { resolveTurn = () => resolve(voiceTurn(id)); }) });
  t.after(() => h.controller.close());
  await h.sayWithoutSilenceSamples();
  h.recorder.sample(-70);
  await h.clock.advance(1100);
  assert.equal(h.ids.length, 0);
  await h.clock.advance(100);
  assert.equal(h.stopped, 1);
  assert.equal(h.controller.state.status, 'processing');
  assert.equal(h.controller.state.microphoneActive, false);
  assert.deepEqual(h.ids, ['request-1']);
  await h.clock.advance(2000);
  assert.equal(h.ids.length, 1, 'The silence clock cannot upload the same turn twice');
  resolveTurn(); await flushPlayback();
  assert.equal(h.controller.state.status, 'listening');
});

test('el fallback conserva voz confirmada y autoenvía si el metering se pierde al terminar de hablar', async (t) => {
  const h = await timedHarness();
  t.after(() => h.controller.close());
  await h.sayWithoutSilenceSamples();
  const valid = h.currentRecording;
  h.recorder.sample(undefined);
  await h.clock.advance(1200);
  assert.deepEqual(h.ids, ['request-1']);
  assert.equal(valid.disposed, false);
  assert.equal(h.controller.state.microphonePaused, false);
  assert.equal(h.controller.state.status, 'listening');
});

test('sin muestras nunca se sube silencio y el reloj cierra y abre un turno nuevo', async (t) => {
  const h = await timedHarness();
  t.after(() => h.controller.close());
  const empty = h.currentRecording;
  await h.clock.advance(10000);
  assert.equal(h.stopped, 1);
  assert.equal(empty.disposed, true);
  assert.equal(h.ids.length, 0);
  assert.equal(h.controller.state.status, 'listening');
  assert.equal(h.controller.state.microphonePaused, false);
});

test('el límite de 45 s cierra por reloj si el VAD queda atascado en voz', async (t) => {
  const h = await timedHarness({ cap: { maxAudioDurationSeconds: 90 } });
  t.after(() => h.controller.close());
  for (let i = 0; i < 449; i += 1) {
    await h.clock.advance(100); h.recorder.sample(-20);
  }
  assert.equal(h.ids.length, 0);
  await h.clock.advance(100);
  assert.equal(h.stopped, 1);
  assert.deepEqual(h.ids, ['request-1']);
  assert.equal(h.controller.state.status, 'listening');
});

test('pausar o finalizar cancela los timers e ignora muestras tardías', async (t) => {
  const h = await timedHarness();
  t.after(() => h.controller.close());
  await h.sayWithoutSilenceSamples();
  const oldSample = h.recorder.sample;
  await h.controller.toggleMicrophone();
  assert.equal(h.clock.pending, 0);
  await h.clock.advance(50000); oldSample(-20);
  assert.equal(h.ids.length, 0);
  assert.equal(h.active, false);
  await h.controller.toggleMicrophone();
  assert.equal(h.clock.pending, 1);
  await h.controller.close();
  await h.clock.advance(50000);
  assert.equal(h.clock.pending, 0);
  assert.equal(h.active, false);
});

test('el reloj de captura queda apagado durante Lux y se reinicia tras el audio para un segundo turno', async (t) => {
  const finishes = [];
  const h = await timedHarness({ turn: async (_r, id) => voiceTurn(id, readySpeech), play: async (_r, done) => finishes.push(done) });
  t.after(() => h.controller.close());
  await h.sayWithoutSilenceSamples();
  await h.clock.advance(1200);
  assert.equal(h.controller.state.status, 'speaking');
  assert.equal(h.clock.pending, 0);
  assert.equal(h.active, false);
  const oldSample = h.recorder.sample;
  await h.clock.advance(50000); oldSample(-20);
  assert.equal(h.ids.length, 1);
  finishes[0](); await flushPlayback();
  assert.equal(h.controller.state.status, 'listening');
  assert.equal(h.clock.pending, 1);
  await h.sayWithoutSilenceSamples();
  await h.clock.advance(1200);
  assert.deepEqual(h.ids, ['request-1', 'request-2']);
  assert.equal(h.controller.state.transcript, 'Consulta hablada');
  assert.equal(h.controller.state.answer, 'Respuesta');
});

test('no reinicia captura ni envía antes de que stop devuelva un archivo válido', async (t) => {
  let finishStop;
  const h = await timedHarness({ stop: (rec) => new Promise((resolve) => { finishStop = () => resolve(rec); }) });
  t.after(() => h.controller.close());
  await h.sayWithoutSilenceSamples();
  await h.clock.advance(1200);
  await h.controller.listen();
  assert.equal(h.ids.length, 0);
  assert.equal(h.controller.state.status, 'processing');
  assert.equal(h.events.filter((e) => e[0] === 'capture-start').length, 1);
  finishStop(); await flushPlayback();
  assert.equal(h.ids.length, 1);
  assert.equal(h.controller.state.status, 'listening');
});

test('un fallo de stop libera el grabador antes de volver a escuchar y no sube audio', async (t) => {
  const h = await timedHarness({ stop: async () => { throw new Error('No encontramos el archivo de audio.'); } });
  t.after(() => h.controller.close());
  await h.sayWithoutSilenceSamples();
  await h.clock.advance(1200);
  assert.equal(h.ids.length, 0);
  assert.equal(h.controller.state.status, 'listening');
  const disposed = h.events.findIndex((e) => e[0] === 'capture-dispose');
  const restarted = h.events.findIndex((e, i) => i > disposed && e[0] === 'capture-start');
  assert.ok(disposed >= 0 && restarted > disposed);
});

test('un archivo sin URI válida se descarta antes del envío automático', async (t) => {
  const h = await timedHarness({ stop: async (rec) => ({ ...rec, uri: '' }) });
  t.after(() => h.controller.close());
  const invalid = h.currentRecording;
  await h.sayWithoutSilenceSamples();
  await h.clock.advance(1200);
  assert.equal(h.ids.length, 0);
  assert.equal(invalid.disposed, true);
  assert.equal(h.controller.state.status, 'listening');
  assert.match(h.controller.state.error, /archivo de audio válido/);
});

test('los logs de desarrollo cubren el recorrido sin revelar audio, URI, texto ni credenciales', async (t) => {
  const logs = [];
  let done;
  const h = await automaticHarness({ logs, turn: async (_r, id) => voiceTurn(id, readySpeech), play: async (_r, finished) => { done = finished; } });
  t.after(() => h.controller.close());
  await h.say(); done(); await flushPlayback();
  assert.deepEqual(logs.map(([event]) => event), [
    '[Lux Voice] call started', '[Lux Voice] listening started', '[Lux Voice] speech detected',
    '[Lux Voice] silence detected', '[Lux Voice] auto submit turn', '[Lux Voice] sending voice turn',
    '[Lux Voice] backend response received', '[Lux Voice] playing assistant audio', '[Lux Voice] playback ended',
    '[Lux Voice] listening restarted',
  ]);
  assert.doesNotMatch(JSON.stringify(logs), /file:|blob:|Bearer|token|Consulta hablada|Respuesta/);
  assert.deepEqual(Object.keys(logs[4][1]).sort(), ['durationMs', 'hasSpeech', 'meteringReliable']);
});

test('VAD rechaza ruido breve, tolera pausas de frase y estima una pausa solo tras confirmar voz', () => {
  const detector = new policy.EndOfTurnDetector(0, 30000);
  for (let t = 100; t <= 3000; t += 100) detector.sample(t % 300 === 0 ? -20 : -70, t);
  assert.equal(detector.hasSpeech, false);
  for (let t = 3100; t <= 3800; t += 100) detector.sample(-20, t);
  assert.equal(detector.hasSpeech, true);
  assert.equal(detector.sample(-70, 4600), null);
  assert.equal(detector.sample(-20, 4700), null, 'A new word extends the phrase');
  assert.equal(detector.sample(undefined, 5800), null);
  assert.equal(detector.sample(undefined, 5900), 'send');
  assert.equal(detector.sample(undefined, 30000), 'send');
});

test('la conversación descarta silencio y vuelve a escuchar sin enviar ni mostrar un borrador', async (t) => {
  const h = await automaticHarness();
  t.after(() => h.controller.close());
  const silent = h.currentRecording;
  await h.sample(-70, 10000);
  assert.equal(silent.disposed, true);
  assert.equal(h.controller.state.status, 'listening');
  assert.equal(h.controller.state.draft, null);
  assert.equal(h.controller.state.error, '');
  assert.equal(h.ids.length, 0);
});

test('una frase sostenida cierra automáticamente a los 45 segundos aunque el servidor permita más', async (t) => {
  const h = await automaticHarness({ cap: { maxAudioDurationSeconds: 90 } });
  t.after(() => h.controller.close());
  for (let i = 0; i < 7; i += 1) await h.sample(-20);
  await h.sample(-20, 44300);
  assert.equal(h.ids.length, 1);
  assert.equal(h.controller.state.status, 'listening');
});

test('el máximo de una nota manual descarta silencio en lugar de seguir grabando indefinidamente', async (t) => {
  let now = 0;
  const h = harness({ clock: () => now });
  t.after(() => h.controller.close());
  await h.controller.loadCapabilities();
  await h.controller.begin({ localConversationId: 'same-chat' }, false);
  now = 30000; h.recorder.sample(-70);
  await flushPlayback();
  assert.equal(h.active, false);
  assert.equal(h.ids.length, 0);
  assert.equal(h.controller.state.draft, null);
});

test('silencio sostenido envía solo una vez, reproduce y permite otro turno con un ID nuevo', async (t) => {
  const finishes = [];
  const h = await automaticHarness({ turn: async (_rec, id) => voiceTurn(id, readySpeech), play: async (_r, done) => finishes.push(done) });
  t.after(() => h.controller.close());
  await h.say();
  assert.deepEqual(h.ids, ['request-1']);
  assert.equal(h.controller.state.status, 'speaking');
  await h.sample(-70);
  await h.controller.sendDraft();
  assert.equal(h.ids.length, 1);
  finishes[0]();
  await flushPlayback();
  assert.equal(h.controller.state.status, 'listening');
  await h.say();
  assert.deepEqual(h.ids, ['request-1', 'request-2']);
  assert.equal(h.events.filter((e) => e[0] === 'turn').length, 2);
});

test('la llamada continúa con texto si Piper está caído y vuelve a solicitar voz en el siguiente turno', async (t) => {
  const requestedAudio = [];
  const h = await automaticHarness({ cap: { synthesisAvailable: false }, turn: async (_r, id, _s, mode, wantsAudio) => {
    assert.equal(mode, 'conversation'); requestedAudio.push(wantsAudio);
    return { ...voiceTurn(id), status: 'completed_with_synthesis_error', warnings: ['Piper no disponible.'] };
  } });
  t.after(() => h.controller.close());
  await h.say(); assert.equal(h.controller.state.status, 'listening');
  assert.equal(h.controller.state.answer, 'Respuesta');
  assert.match(h.controller.state.warnings.join(' '), /respuesta está escrita/);
  await h.say(); assert.equal(h.controller.state.status, 'listening');
  assert.deepEqual(requestedAudio, [true, true]);
  assert.deepEqual(h.ids, ['request-1', 'request-2']);
});

test('una cancelación del servidor libera el turno sin publicar respuestas y permite hablar de nuevo', async (t) => {
  const h = await automaticHarness({ turn: async () => { throw Object.assign(new Error('Cancelada por el servidor'), { code: 'CANCELLED' }); } });
  t.after(() => h.controller.close());
  await h.say();
  assert.equal(h.controller.state.status, 'listening'); assert.equal(h.controller.state.draft, null);
  assert.equal(h.events.filter((e) => e[0] === 'turn').length, 0);
  await h.say(); assert.deepEqual(h.ids, ['request-1', 'request-2']);
});

test('los errores de causa inválida, acceso y audio vencido no se confunden con rutas de voz ausentes', () => {
  assert.match(policy.voiceErrorMessage({ code: 'INVALID_CASE_ID', status: 400 }), /causa seleccionada no es válida/);
  assert.match(policy.voiceErrorMessage({ code: 'CASE_NOT_FOUND', status: 404 }), /no existe o no tenés acceso/);
  assert.match(policy.voiceErrorMessage({ code: 'AUDIO_NOT_FOUND', status: 404 }), /Pedí nuevamente la voz/);
  assert.match(policy.voiceErrorMessage({ code: 'REQUEST_IN_PROGRESS', status: 409 }), /mismo pedido/);
});

test('sin VAD fiable la llamada cierra y reinicia sin enviar audio no verificado ni exigir botones', async (t) => {
  const h = await automaticHarness();
  t.after(() => h.controller.close());
  await h.sample(undefined, 1600);
  assert.equal(h.controller.state.microphonePaused, false);
  assert.equal(h.active, true);
  const unverified = h.currentRecording;
  await h.sample(undefined, 8400);
  assert.equal(unverified.disposed, true);
  assert.equal(h.controller.state.status, 'listening');
  assert.equal(h.controller.state.draft, null);
  assert.equal(h.ids.length, 0);
  assert.match(h.controller.state.error, /confirmar voz/);
  await h.say();
  assert.equal(h.ids.length, 1);
});

test('el fallo de transcripción libera el turno y continúa escuchando; el fallo de red conserva su ID', async (t) => {
  let attempt = 0;
  const h = await automaticHarness({ turn: async (_r, id) => {
    attempt += 1;
    if (attempt === 1) throw Object.assign(new Error('transcription failed'), { status: 422 });
    if (attempt === 2) throw Object.assign(new Error('offline'), { code: 'NETWORK_ERROR' });
    return voiceTurn(id);
  } });
  t.after(() => h.controller.close());
  const first = h.currentRecording;
  await h.say();
  assert.equal(first.disposed, true);
  assert.equal(h.controller.state.status, 'listening');
  assert.match(h.controller.state.error, /transcribir/);
  await h.say();
  assert.equal(h.controller.state.status, 'error');
  assert.ok(h.controller.state.draft);
  await h.controller.sendDraft();
  assert.deepEqual(h.ids, ['request-1', 'request-2', 'request-2']);
  assert.equal(h.events.filter((e) => e[0] === 'turn').length, 1);
  assert.equal(h.controller.state.status, 'listening');
});

test('fallar síntesis, descarga o reproducción conserva la respuesta escrita y retoma escucha', async (t) => {
  for (const failure of ['synthesis', 'download', 'playback']) {
    const h = await automaticHarness({
      turn: async (_r, id) => voiceTurn(id, failure === 'synthesis' ? undefined : readySpeech),
      audio: async () => {
        if (failure === 'download') throw new Error('download failed');
        return { uri: 'blob:response', dispose: async () => {} };
      },
      play: async () => { if (failure === 'playback') throw new Error('autoplay blocked'); },
    });
    t.after(() => h.controller.close());
    await h.say();
    assert.equal(h.controller.state.answer, 'Respuesta');
    assert.equal(h.events.filter((e) => e[0] === 'turn').length, 1);
    assert.equal(h.controller.state.status, 'listening', failure);
    assert.equal(h.active, true);
  }
});

test('hablar durante Lux interrumpe, descarta el monitor y no envía el audio de la respuesta', async (t) => {
  let finished;
  const h = await automaticHarness({ monitoring: true, turn: async (_r, id) => voiceTurn(id, readySpeech), play: async (_r, done, _failed, options) => {
    assert.equal(options.duplex, true); finished = done;
  } });
  t.after(() => h.controller.close());
  await h.say();
  assert.equal(h.controller.state.monitoring, true);
  const monitorRecording = h.currentRecording;
  // Low-volume echo cannot interrupt; near-field speech must be sustained.
  for (let i = 0; i < 10; i += 1) await h.sample(-40);
  assert.equal(h.controller.state.status, 'speaking');
  for (let i = 0; i < 7; i += 1) await h.sample(-20);
  assert.equal(h.controller.state.status, 'listening');
  assert.equal(h.controller.state.monitoring, false);
  assert.equal(monitorRecording.disposed, true);
  assert.equal(h.ids.length, 1);
  finished();
  await flushPlayback();
  assert.equal(h.events.filter((e) => e[0] === 'capture-start').length, 2);
});

test('pausar y finalizar detienen también el monitor durante la respuesta', async (t) => {
  const h = await automaticHarness({ monitoring: true, turn: async (_r, id) => voiceTurn(id, readySpeech) });
  t.after(() => h.controller.close());
  await h.say();
  await h.controller.toggleMicrophone();
  assert.equal(h.controller.state.status, 'speaking');
  assert.equal(h.controller.state.monitoring, false);
  assert.equal(h.active, false);
  await h.controller.toggleMicrophone();
  assert.equal(h.controller.state.monitoring, true);
  await h.controller.close();
  assert.equal(h.active, false);
  assert.equal(h.controller.state.conversation, false);
  assert.equal(h.controller.state.monitoring, false);
});

test('el umbral es ajustable sin reiniciar la escucha y respeta límites', async (t) => {
  const h = await automaticHarness();
  t.after(() => h.controller.close());
  h.controller.setThreshold(-30);
  for (let i = 0; i < 7; i += 1) await h.sample(-35);
  assert.equal(h.controller.state.speechDetected, false);
  h.controller.setThreshold(-50);
  for (let i = 0; i < 7; i += 1) await h.sample(-35);
  assert.equal(h.controller.state.speechDetected, true);
  h.controller.setThreshold(-100); assert.equal(h.controller.state.thresholdDb, -60);
  h.controller.setThreshold(-10); assert.equal(h.controller.state.thresholdDb, -20);
});

test('cancelar durante el upload descarta su ID y el resultado tardío mientras empieza un turno nuevo', async (t) => {
  let resolveFirst;
  let attempt = 0;
  const h = harness({ turn: async (_r, id) => {
    if (++attempt === 1) return new Promise((resolve) => { resolveFirst = resolve; });
    return voiceTurn(id);
  } });
  t.after(() => h.controller.close());
  await h.controller.loadCapabilities();
  await h.controller.begin({ localConversationId: 'same-chat' }, true);
  await h.controller.finishCapture(false);
  const first = h.controller.sendDraft();
  await flushPlayback();
  h.controller.cancelRequest();
  await flushPlayback();
  assert.equal(h.controller.state.draft, null);
  assert.equal(h.controller.state.status, 'listening');
  await h.controller.finishCapture(false);
  await h.controller.sendDraft();
  resolveFirst(voiceTurn('request-1'));
  await first;
  assert.deepEqual(h.ids, ['request-1', 'request-2']);
  assert.equal(h.events.filter((e) => e[0] === 'turn').length, 1);
  assert.equal(h.events.filter((e) => e[0] === 'settled').length, 2);
  assert.equal(h.controller.state.status, 'listening');
});

test('finalizar durante descarga privada descarta el recurso tardío y nunca reproduce', async (t) => {
  let resolveAudio;
  let disposed = false;
  const h = harness({ turn: async (_r, id) => voiceTurn(id, readySpeech), audio: async () => new Promise((resolve) => { resolveAudio = resolve; }) });
  t.after(() => h.controller.close());
  await h.controller.loadCapabilities();
  await h.controller.begin({ localConversationId: 'same-chat' }, true);
  const sending = h.controller.finishCapture(true);
  await flushPlayback();
  await h.controller.close();
  resolveAudio({ uri: 'blob:late', dispose: async () => { disposed = true; } });
  await sending;
  assert.equal(disposed, true);
  assert.equal(h.events.filter((e) => e[0] === 'play').length, 0);
  assert.equal(h.controller.state.status, 'inactive');
});

test('cancelar una descarga vuelve a escuchar y descarta el audio tardío sin detener la captura nueva', async (t) => {
  let resolveAudio;
  let disposed = false;
  const h = harness({ turn: async (_r, id) => voiceTurn(id, readySpeech), audio: async () => new Promise((resolve) => { resolveAudio = resolve; }) });
  t.after(() => h.controller.close());
  await h.controller.loadCapabilities();
  await h.controller.begin({ localConversationId: 'same-chat' }, true);
  const sending = h.controller.finishCapture(true);
  await flushPlayback();
  h.controller.cancelRequest();
  await flushPlayback();
  assert.equal(h.controller.state.status, 'listening');
  resolveAudio({ uri: 'blob:cancelled', dispose: async () => { disposed = true; } });
  await sending;
  assert.equal(disposed, true);
  assert.equal(h.active, true);
  assert.equal(h.events.filter((e) => e[0] === 'play').length, 0);
});

test('conversación escribe el turno, pide voz automáticamente y vuelve a escuchar al terminar', async () => {
  let finished;
  const h = harness({
    turn: async (_rec, id, scope, mode, wantsAudio) => {
      assert.equal(scope.localConversationId, 'same-chat');
      assert.equal(mode, 'conversation');
      assert.equal(wantsAudio, true);
      return voiceTurn(id, readySpeech);
    },
    play: async (_resource, done) => { finished = done; },
  });
  await h.controller.loadCapabilities();
  assert.equal(h.controller.autoRead, false, 'Call mode must not depend on the note preference');
  await h.controller.begin({ localConversationId: 'same-chat' }, true);
  await h.controller.finishCapture(true);
  assert.equal(h.controller.state.transcript, 'Consulta hablada');
  assert.equal(h.controller.state.answer, 'Respuesta');
  assert.equal(h.events.filter((event) => event[0] === 'turn').length, 1);
  assert.equal(h.controller.state.status, 'speaking');
  assert.equal(h.active, false);
  finished();
  await flushPlayback();
  assert.equal(h.controller.state.status, 'listening');
  assert.equal(h.active, true);
  assert.equal(h.events.filter((event) => event[0] === 'capture-start').length, 2);
  await h.controller.close();
  assert.equal(h.active, false);
  assert.equal(h.controller.state.conversation, false);
  assert.equal(h.controller.state.playingId, null);
  assert.equal(h.currentRecording.disposed, true);
});

test('pausar el micrófono durante la respuesta impide que vuelva a activarse', async () => {
  let finished;
  const h = harness({ turn: async (_rec, id) => voiceTurn(id, readySpeech), play: async (_r, done) => { finished = done; } });
  await h.controller.loadCapabilities();
  await h.controller.begin({ localConversationId: 'same-chat' }, true);
  await h.controller.finishCapture(true);
  await h.controller.toggleMicrophone();
  assert.equal(h.controller.state.microphonePaused, true);
  assert.equal(h.controller.state.status, 'speaking', 'Pausing the mic does not interrupt Lux');
  finished();
  await flushPlayback();
  assert.equal(h.controller.state.status, 'inactive');
  assert.equal(h.active, false);
  await h.controller.toggleMicrophone();
  assert.equal(h.controller.state.status, 'listening');
  assert.equal(h.active, true);
});

test('reanudar micrófono mientras Lux habla espera el fin del audio', async () => {
  let finished;
  const h = harness({ turn: async (_rec, id) => voiceTurn(id, readySpeech), play: async (_r, done) => { finished = done; } });
  await h.controller.loadCapabilities();
  await h.controller.begin({ localConversationId: 'same-chat' }, true);
  await h.controller.finishCapture(true);
  await h.controller.toggleMicrophone();
  await h.controller.toggleMicrophone();
  assert.equal(h.controller.state.status, 'speaking');
  assert.equal(h.active, false);
  finished();
  await flushPlayback();
  assert.equal(h.controller.state.status, 'listening');
  assert.equal(h.events.filter((event) => event[0] === 'capture-start').length, 2);
});

test('pausar durante procesamiento se conserva al reproducir y terminar la respuesta', async () => {
  let finishTurn;
  let finished;
  const h = harness({ turn: (_rec, id) => new Promise((resolve) => { finishTurn = () => resolve(voiceTurn(id, readySpeech)); }), play: async (_r, done) => { finished = done; } });
  await h.controller.loadCapabilities();
  await h.controller.begin({ localConversationId: 'same-chat' }, true);
  const pending = h.controller.finishCapture(true);
  await flushPlayback();
  await h.controller.toggleMicrophone();
  assert.equal(h.controller.state.status, 'processing');
  finishTurn();
  await pending;
  assert.equal(h.controller.state.status, 'speaking');
  finished();
  await flushPlayback();
  assert.equal(h.active, false);
  assert.equal(h.controller.state.microphonePaused, true);
});

test('interrumpir libera el audio antes de escuchar y descarta el callback tardío', async () => {
  let finished;
  const h = harness({ turn: async (_rec, id) => voiceTurn(id, readySpeech), play: async (_r, done) => { finished = done; } });
  await h.controller.loadCapabilities();
  await h.controller.begin({ localConversationId: 'same-chat' }, true);
  await h.controller.finishCapture(true);
  await h.controller.interrupt();
  assert.equal(h.active, true);
  const disposed = h.events.findIndex((event) => event[0] === 'dispose-audio');
  const secondStart = h.events.findIndex((event, index) => index > disposed && event[0] === 'capture-start');
  assert.ok(disposed >= 0 && secondStart > disposed);
  finished();
  await flushPlayback();
  assert.equal(h.events.filter((event) => event[0] === 'capture-start').length, 2);
});

test('Hablar con Lux mantiene separada la nota manual sin perderla ni enviarla', async () => {
  const h = harness({ turn: async (_r, id, _s, mode, wantsAudio) => {
    assert.equal(mode, 'message');
    assert.equal(wantsAudio, false);
    return voiceTurn(id);
  } });
  await h.controller.loadCapabilities();
  const scope = { localConversationId: 'same-chat', caseId: 'case-1' };
  await h.controller.begin(scope, false);
  await h.controller.begin(scope, true);
  assert.equal(h.controller.state.conversation, false);
  assert.match(h.controller.state.error, /nota de voz/);
  assert.equal(h.events.filter((event) => event[0] === 'capture-start').length, 1);
  await h.controller.finishCapture(false);
  assert.equal(h.ids.length, 0);
  await h.controller.sendDraft();
  assert.deepEqual(h.ids, ['request-1']);
});

test('una nota revisada conserva su draft y su ID hasta enviarla antes de la llamada', async () => {
  const h = harness({ turn: async (_r, id, _s, mode, wantsAudio) => {
    assert.equal(mode, 'message'); assert.equal(wantsAudio, false); return voiceTurn(id);
  } });
  await h.controller.loadCapabilities();
  const scope = { localConversationId: 'same-chat' };
  await h.controller.begin(scope, false);
  await h.controller.finishCapture(false);
  const draft = h.controller.state.draft;
  await h.controller.begin(scope, true);
  assert.equal(h.controller.state.draft, draft);
  assert.equal(h.controller.state.conversation, false);
  assert.equal(h.ids.length, 0);
  await h.controller.sendDraft();
  assert.deepEqual(h.ids, ['request-1']);
});

test('cerrar durante una solicitud cancela e ignora el resultado tardío', async () => {
  let resolveTurn;
  const delayed = new Promise((resolve) => { resolveTurn = resolve; });
  const h = harness({ turn: async () => delayed });
  await h.controller.loadCapabilities();
  await h.controller.begin({ localConversationId: 'local-1' }, false);
  await h.controller.finishCapture(false);
  const sending = h.controller.sendDraft();
  await Promise.resolve();
  const closing = h.controller.close();
  resolveTurn(voiceTurn('request-1'));
  await sending;
  await closing;
  assert.equal(h.events.filter((event) => event[0] === 'turn').length, 0);
  assert.ok(h.events.some((event) => event[0] === 'cancel' && event[1] === 'request-1'));
  assert.equal(h.controller.state.microphoneActive, false);
});

test('la reconciliación elimina el optimista y evita IDs duplicados', () => {
  const current = [
    { id: 'voice-request-1', clientRequestId: 'request-1', role: 'user', text: 'Enviando' },
    { id: 'assistant-1', role: 'assistant', text: 'Viejo' },
  ];
  const returned = [
    { id: 'user-1', role: 'user', text: 'Hola' },
    { id: 'assistant-1', role: 'assistant', text: 'Actualizado' },
  ];
  const result = policy.reconcileVoiceMessages(current, 'request-1', returned);
  assert.deepEqual(Array.from(result, (item) => item.id), ['user-1', 'assistant-1']);
  assert.equal(result[1].text, 'Actualizado');
});

test('la grabación nativa verifica existencia, URI y bytes antes de enviarse', async () => {
  const native = loadTypeScript('src/voice/nativeRecording.ts', {
    'expo-file-system': { FileMode: { ReadOnly: 'r' } },
  });
  let closed = false;
  let deleted = false;
  const file = {
    uri: 'file:///recording.m4a',
    name: 'recording.m4a',
    exists: true,
    size: 256,
    open(mode) {
      assert.equal(mode, 'r');
      return {
        readBytes(length) { assert.equal(length, 16); return Uint8Array.from([1, 2, 3]); },
        close() { closed = true; },
      };
    },
    delete() { deleted = true; this.exists = false; },
  };

  const result = native.createNativeRecording(file, 1200);
  assert.equal(closed, true);
  assert.equal(result.size, 256);
  assert.equal(result.mimeType, 'audio/mp4');
  await result.dispose();
  assert.equal(deleted, true);

  assert.throws(
    () => native.createNativeRecording({ ...file, uri: '/invalid/path', exists: true }, 1200),
    /URI/
  );
  assert.throws(
    () => native.createNativeRecording({ ...file, exists: true, size: 0 }, 1200),
    /vacía/
  );
  assert.throws(
    () => native.createNativeRecording({ ...file, exists: false }, 1200),
    /no existe/
  );
  assert.throws(
    () => native.createNativeRecording({
      ...file,
      exists: true,
      open: () => ({ readBytes: () => new Uint8Array(), close: () => undefined }),
    }, 1200),
    /bytes legibles/
  );
});

test('el reproductor nativo usa el auricular en dúplex y no crea audio tras finalizar durante su preparación', async () => {
  let resolveMode;
  let created = 0;
  const { createPlayback } = loadTypeScript('src/voice/createPlayback.ts', {
    'expo-audio': {
      setAudioModeAsync(mode) {
        assert.equal(mode.allowsRecording, true);
        assert.equal(mode.shouldRouteThroughEarpiece, true);
        assert.equal(mode.shouldPlayInBackground, false);
        return new Promise((resolve) => { resolveMode = resolve; });
      },
      createAudioPlayer() { created += 1; throw new Error('Cancelled playback must not create a player'); },
    },
  });
  const playback = createPlayback();
  const starting = playback.play({ uri: 'file:///response.wav' }, () => {}, () => {}, { duplex: true });
  await playback.stop();
  resolveMode(); await starting;
  assert.equal(created, 0);
});

test('el grabador Expo usa voice_communication, monitor por auricular y elimina su archivo sin subirlo', async () => {
  const modes = [];
  let options;
  let deleted = false;
  const audioRecorder = {
    uri: 'file:///monitor.m4a',
    async prepareToRecordAsync(value) { options = value; }, record() {},
    getStatus: () => ({ isRecording: true, metering: -70 }), async stop() {},
  };
  const File = class {
    constructor(uri) { this.uri = uri; this.name = 'monitor.m4a'; this.exists = true; this.size = 256; }
    open() { return { readBytes: () => Uint8Array.from([1, 2, 3]), close() {} }; }
    delete() { deleted = true; this.exists = false; }
  };
  const native = loadTypeScript('src/voice/nativeRecording.ts', { 'expo-file-system': { File, FileMode: { ReadOnly: 'r' } } });
  const { useVoiceRecorder } = loadTypeScript('src/voice/useVoiceRecorder.ts', {
    react: { useMemo: (create) => create() },
    'expo-audio': {
      RecordingPresets: { HIGH_QUALITY: { android: {} } },
      useAudioRecorder: () => audioRecorder,
      requestRecordingPermissionsAsync: async () => ({ granted: true }),
      setAudioModeAsync: async (mode) => modes.push(mode),
    },
    'expo-file-system': { File }, './nativeRecording': native, './voicePolicy': policy,
  });
  const recorder = useVoiceRecorder();
  assert.equal(recorder.supportsMonitoring, true);
  await recorder.start(capabilities(), () => {}, new AbortController().signal, { monitoring: true });
  assert.equal(options.android.audioSource, 'voice_communication');
  assert.equal(options.isMeteringEnabled, true);
  assert.equal(modes[0].shouldRouteThroughEarpiece, true);
  await recorder.dispose();
  assert.equal(deleted, true);
  assert.equal(modes.at(-1).allowsRecording, false);
});
