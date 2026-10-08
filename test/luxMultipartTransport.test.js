const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { File: WebFile } = require('node:buffer');
const { fileURLToPath, pathToFileURL } = require('node:url');
const vm = require('node:vm');
const test = require('node:test');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');
const requestId = '39d6784c-6bd2-424d-ac24-bf01fb05df8d';
const binaryAudio = Buffer.from(Array.from({ length: 64801 }, (_, i) => i % 256));
const turnResponse = {
  conversationId: 'remote-conversation', transcript: 'Consulta hablada',
  userMessage: { id: 'user-1', text: 'Consulta hablada' },
  assistantMessage: { id: 'assistant-1', text: 'Respuesta' },
  speech: { status: 'unavailable' }, warnings: [],
};
// Shape read from /opt/luxia/backend/docs/lux-voice-contract.md. Written
// sources are flat; speech.text is deliberately shorter than response.
const contractResponse = {
  requestId: 'server-request', clientRequestId: requestId, status: 'completed', mode: 'conversation',
  conversationId: 'cmcontractconversation', transcript: 'Hola Lux, ¿me escuchás?', transcription: 'Hola Lux, ¿me escuchás?',
  response: 'Respuesta completa con citas [1] y documentos.',
  citations: [{ title: 'Fuente del contrato' }], documentsUsed: [{ name: 'Documento del expediente' }],
  userMessageId: 'cmuser', assistantMessageId: 'cmassistant',
  userMessage: { id: 'cmuser', role: 'user', content: 'Hola Lux, ¿me escuchás?', source: 'audio', metadataJson: { voiceMode: 'conversation' } },
  assistantMessage: { id: 'cmassistant', role: 'assistant', content: 'Respuesta completa con citas [1] y documentos.', source: 'text', metadataJson: {} },
  audioId: 'private-audio', audioUrl: '/api/v1/lux/voice/audio/private-audio', audioDurationMs: 3529,
  speech: { status: 'ready', errorCode: null, text: 'Respuesta oral breve.', audioId: 'private-audio',
    audioUrl: '/api/v1/lux/voice/audio/private-audio', mimeType: 'audio/wav', durationMs: 3529 },
  timings: { uploadMs: 35, whisperMs: 1850, piperMs: 720, totalMs: 3410 }, warnings: [],
};

// Load installed implementations, including the RN FormData and Expo runtime
// patch, public expo/fetch entry, fetch/FetchResponse, RequestUtils and serializer.
// Only native bridge operations (unavailable in Node) and unrelated app services
// are replaced. No mocked FormData, multipart converter or fetch implementation.
function sourceLoader(globals, overrides = {}) {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
      filename, babelrc: false, configFile: false,
      plugins: [
        filename.endsWith('.ts') ? ['@babel/plugin-transform-typescript', { allowDeclareFields: true }] : '@babel/plugin-transform-flow-strip-types',
        '@babel/plugin-transform-modules-commonjs',
      ],
    }).code;
    const dependencies = overrides[filename] || {};
    vm.runInNewContext(source, {
      ...globals, module, exports: module.exports,
      require(name) {
        if (Object.prototype.hasOwnProperty.call(dependencies, name)) return dependencies[name];
        if (!name.startsWith('.')) throw new Error(`Unmapped dependency in ${filename}: ${name}`);
        const base = path.resolve(path.dirname(filename), name);
        const target = [base, `${base}.ts`, `${base}.js`, path.join(base, 'index.ts')]
          .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        if (!target) throw new Error(`Missing dependency: ${base}`);
        return load(target);
      },
    }, { filename });
    return module.exports;
  }
  return load;
}

function harness(t, platform = 'ios', options = {}) {
  const logs = [];
  const starts = [];
  const refreshes = [];
  let cancelled = 0;
  let reads = 0;
  let globalFetchCalls = 0;
  let installedFetch;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lux-multipart-'));
  t.after(() => {
    assert.equal(path.dirname(tempDir), path.resolve(os.tmpdir()));
    assert.ok(path.basename(tempDir).startsWith('lux-multipart-'));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  const audioPath = path.join(tempDir, 'recording.m4a');
  fs.writeFileSync(audioPath, binaryAudio);
  const recording = {
    uri: pathToFileURL(audioPath).href, name: 'recording.m4a', mimeType: 'audio/mp4',
    size: binaryAudio.length, durationMs: 1500, dispose: async () => {},
  };
  const globals = {
    AbortController, ArrayBuffer, Blob, Date, Error, FormData, Headers, JSON, Map,
    Math, Number, Object, Promise, ReadableStream, Request, Set, String, Symbol,
    TextDecoder, TextEncoder, Uint8Array, URL, URLSearchParams, clearTimeout, setTimeout,
    __DEV__: true,
    console: Object.fromEntries(['info', 'error', 'warn', 'log'].map((level) => [level, (...args) => logs.push(args.join(' '))])),
    fetch: (...args) => {
      globalFetchCalls += 1;
      if (options.webFetch) return options.webFetch(...args);
      if (options.globalExpoFetch) return installedFetch(...args);
      throw new Error('Native multipart accidentally used global fetch / RN XHR');
    },
  };

  class NativeResponse {
    addListener() { return { remove() {} }; }
    get status() { return this.responseStatus || 200; }
    get statusText() { return 'OK'; }
    get _rawHeaders() { return this.responseHeaders || [['Content-Type', 'application/json']]; }
    get url() { return 'https://api.test/api/v1/lux/voice/turn'; }
    get redirected() { return false; }
    cancelStreaming() {}
    async text() { return JSON.stringify(this.responseBody || turnResponse); }
    async arrayBuffer() { return new Uint8Array(this.responseBytes).buffer; }
  }
  class NativeRequest {
    constructor(response) { this.response = response; }
    async start(url, init, body) {
      const request = { url, init, body };
      starts.push(request);
      if (options.start) return options.start(this.response, starts.length, request);
      this.response.responseStatus = options.retryAuth && starts.length === 1 ? 401 : 200;
    }
    cancel() { cancelled += 1; }
  }
  class NativeFile {
    constructor(uri) {
      if (options.fileConstructorError) throw options.fileConstructorError;
      this.uri = uri;
    }
    validatePath() {}
    get type() { return 'audio/x-m4a'; } // Preserve recorder MIME instead of OS inference.
    get exists() { return fs.existsSync(fileURLToPath(this.uri)); }
    write(bytes) { fs.writeFileSync(fileURLToPath(this.uri), bytes); }
    delete() {
      const filename = fileURLToPath(this.uri);
      assert.equal(path.dirname(filename), tempDir);
      fs.unlinkSync(filename);
    }
    async bytes() {
      reads += 1;
      if (options.read) return options.read();
      return new Uint8Array(fs.readFileSync(fileURLToPath(this.uri)));
    }
  }
  const overrides = {
    [path.join(root, 'node_modules/expo/src/winter/fetch/ExpoFetchModule.ts')]: {
      'expo-modules-core': { requireNativeModule: () => ({ NativeRequest, NativeResponse }) },
    },
    [path.join(root, 'node_modules/expo-file-system/src/File.ts')]: {
      'expo-modules-core': {},
      './Directory': {}, './NetworkTasks': {}, './internal/FileSystemWatcher': {},
      './ExpoFileSystem': { FileSystemFile: NativeFile },
      './Paths': { Paths: {
        join: (...parts) => parts.join('/'), basename: (uri) => path.basename(fileURLToPath(uri)),
      } },
    },
  };
  const load = sourceLoader(globals, overrides);
  if (platform !== 'web') {
    const RNFormData = load(path.join(root, 'node_modules/react-native/Libraries/Network/FormData.js')).default;
    const { installFormDataPatch } = load(path.join(root, 'node_modules/expo/src/winter/FormData.ts'));
    globals.FormData = installFormDataPatch(RNFormData);
  }
  const expoFetch = load(path.join(root, 'node_modules/expo/fetch.js'));
  installedFetch = expoFetch.fetch;
  const fileSystem = { File: load(path.join(root, 'node_modules/expo-file-system/src/File.ts')).File, Paths: { cache: pathToFileURL(tempDir).href } };
  overrides[path.join(root, 'src/services/api.js')] = {
    'react-native': { Platform: { OS: platform } }, 'expo/fetch': expoFetch, 'expo-file-system': fileSystem,
    '../config/api': { API_BASE_URL: options.apiBase || 'https://api.test/api/v1', API_ROOT_URL: 'https://api.test' },
    '../config/captureMode': { IS_CAPTURE_MODE: false },
    '../config/firebase': { auth: { currentUser: { getIdToken: async (refresh) => {
      refreshes.push(refresh); return refresh ? 'refreshed-test-token' : 'test-token';
    } } } },
    'firebase/auth': { signOut: async () => {} }, '../data/mockData': [],
    '../utils/status': { normalizeStatusLabel: (value) => value },
    '../utils/userDisplay': { getUserDisplayName: () => '', getUserEmail: () => '', getUserRole: () => '' },
  };
  const api = load(path.join(root, 'src/services/api.js'));
  api.setAuthState('authenticated');
  overrides[path.join(root, 'src/services/luxVoice.ts')] = {
    './api': api, ...(!options.realAudio ? { '../voice/audioResource': { materializeAudio: () => ({}) } } : {}),
  };
  if (options.realAudio) overrides[path.join(root, 'src/voice/audioResource.ts')] = {
    'expo-file-system': fileSystem, 'expo-crypto': { randomUUID: () => 'response-audio' },
  };
  if (options.audioModule) overrides[path.join(root, 'src/voice/createPlayback.ts')] = { 'expo-audio': options.audioModule };
  const voice = load(path.join(root, 'src/services/luxVoice.ts'));
  return {
    api, voice, recording, logs, starts, refreshes, load, FormData: globals.FormData,
    get cancelled() { return cancelled; }, get reads() { return reads; },
    get globalFetchCalls() { return globalFetchCalls; },
  };
}

async function parseMultipart(start) {
  return new Response(start.body, { headers: start.init.headers }).formData();
}

function failedDiagnostic(h) {
  const entry = h.logs.find((line) => line.startsWith('[API request failed]'));
  assert.ok(entry, 'The original failure must be logged');
  return JSON.parse(entry.slice(entry.indexOf('{')));
}

test('reproduce el descriptor RN incompatible en expo/fetch instalado y clasifica la serialización', async (t) => {
  const h = harness(t);
  const body = new h.FormData();
  body.append('audio', { uri: h.recording.uri, name: h.recording.name, type: h.recording.mimeType });
  await assert.rejects(h.api.request('/lux/voice/turn', {
    method: 'POST', body, diagnostics: { clientRequestId: requestId },
  }), (error) => {
    assert.equal(error.code, 'REQUEST_PREPARATION_ERROR');
    assert.equal(error.status, 0);
    assert.equal(error.cause.message, 'Unsupported FormDataPart implementation');
    assert.match(error.cause.stack, /convertFormDataAsync/);
    assert.doesNotMatch(error.message, /conexión|conectarnos/);
    return true;
  });
  assert.equal(h.starts.length, 0, 'Serialization failed before the native request started');
  assert.equal(h.globalFetchCalls, 0);
  const detail = failedDiagnostic(h);
  assert.equal(detail.classification, 'REQUEST_PREPARATION_ERROR');
  assert.equal(detail.exceptionMessage, 'Unsupported FormDataPart implementation');
  assert.match(detail.exceptionStack, /expo.*convertFormData\.ts/);
  assert.equal(detail.transport, 'expo/fetch');
  assert.equal(detail.clientRequestId, requestId);
});

for (const platform of ['ios', 'android']) {
  test(`${platform}: Lux envía bytes multipart por expo/fetch real, conserva auth y reintento 401`, async (t) => {
    const h = harness(t, platform, { retryAuth: true });
    const result = await h.voice.luxVoiceTransport.turn(h.recording, requestId,
      { localConversationId: 'local-1', conversationId: 'local-conversation-1', caseId: 'case-1' },
      'message', true, new AbortController().signal);
    assert.equal(result.transcript, turnResponse.transcript);
    assert.equal(h.globalFetchCalls, 0, 'Explicit Expo import must survive a different global fetch');
    assert.deepEqual(h.refreshes, [false, true]);
    assert.equal(h.starts.length, 2);
    assert.equal(h.reads, 2);
    for (const [i, start] of h.starts.entries()) {
      assert.equal(start.url, 'https://api.test/api/v1/lux/voice/turn');
      assert.equal(start.init.method, 'POST');
      const headers = new Headers(start.init.headers);
      assert.equal(headers.get('Authorization'), `Bearer ${i ? 'refreshed-test-token' : 'test-token'}`);
      assert.match(headers.get('Content-Type'), /^multipart\/form-data; boundary=----ExpoFetchFormBoundary/);
      const form = await parseMultipart(start);
      const audio = form.get('audio');
      assert.equal(audio.name, h.recording.name);
      assert.equal(audio.type, 'audio/mp4');
      assert.equal(audio.size, 64801);
      assert.deepEqual(Buffer.from(await audio.arrayBuffer()), binaryAudio);
      assert.equal(form.get('clientRequestId'), requestId);
      assert.equal(form.get('conversationId'), null);
      assert.equal(form.get('caseId'), 'case-1');
      assert.equal(form.get('mode'), 'message');
      assert.equal(form.get('responseAudio'), 'true');
    }
    const detail = JSON.parse(h.logs.find((line) => line.startsWith('[API request]')).split('[API request] ')[1]);
    assert.equal(detail.timeoutMs, 360000);
    assert.equal(detail.fileSize, 64801);
    assert.equal(detail.audioDurationMs, h.recording.durationMs);
    assert.equal(detail.uriScheme, 'file');
    assert.equal(detail.transport, 'expo/fetch');
    assert.ok(h.logs.every((line) => !line.includes('test-token') && !line.includes(h.recording.uri)));
  });
}

test('web: Blob y File pasan por fetch estándar y el servidor local recibe multipart binario', async (t) => {
  const received = [];
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const form = await new Response(body, { headers: req.headers }).formData();
      received.push({ form, headers: req.headers });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(turnResponse));
    } catch (error) {
      res.writeHead(500); res.end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const h = harness(t, 'web', {
    apiBase: `http://127.0.0.1:${server.address().port}/api/v1`, webFetch: fetch,
  });
  for (const blob of [new Blob([binaryAudio], { type: 'audio/mp4' }), new WebFile([binaryAudio], 'original.m4a', { type: 'audio/mp4' })]) {
    await h.voice.luxVoiceTransport.turn({ ...h.recording, uri: 'blob:test-recording', blob },
      requestId, { localConversationId: 'local-1', conversationId: 'remote-1' },
      'message', false, new AbortController().signal);
  }
  assert.equal(h.starts.length, 0, 'Web must never use the native Expo transport');
  assert.equal(h.reads, 0);
  assert.equal(h.globalFetchCalls, 2);
  assert.equal(received.length, 2);
  for (const { form, headers } of received) {
    assert.equal(headers.authorization, 'Bearer test-token');
    assert.match(headers['content-type'], /^multipart\/form-data; boundary=/);
    const audio = form.get('audio');
    assert.equal(audio.name, h.recording.name);
    assert.equal(audio.type, 'audio/mp4');
    assert.deepEqual(Buffer.from(await audio.arrayBuffer()), binaryAudio);
    assert.equal(form.get('clientRequestId'), requestId);
    assert.equal(form.get('conversationId'), 'remote-1');
    assert.equal(form.get('responseAudio'), 'false');
  }
});

test('una transcripción vacía se clasifica para retomar escucha sin publicar mensajes vacíos', async (t) => {
  const h = harness(t, 'ios', { start: async (response) => { response.responseBody = { ...turnResponse, transcript: '   ' }; } });
  await assert.rejects(h.voice.luxVoiceTransport.turn(h.recording, requestId,
    { localConversationId: 'local-1' }, 'conversation', true, new AbortController().signal), { code: 'EMPTY_TRANSCRIPT' });
});

test('el contrato desplegado conserva respuesta completa, fuentes planas, IDs, voz breve y tiempos', async (t) => {
  const h = harness(t, 'ios', { start: async (response) => { response.responseBody = contractResponse; } });
  const result = await h.voice.luxVoiceTransport.turn(h.recording, requestId,
    { localConversationId: 'local-1', caseId: 12 }, 'conversation', true, new AbortController().signal);
  assert.equal(result.status, 'completed'); assert.equal(result.mode, 'conversation');
  assert.equal(result.userMessage.text, contractResponse.transcript);
  assert.equal(result.userMessage.id, 'cmuser'); assert.equal(result.assistantMessage.id, 'cmassistant');
  assert.equal(result.assistantMessage.text, contractResponse.response);
  assert.equal(result.assistantMessage.citations[0].title, 'Fuente del contrato');
  assert.equal(result.assistantMessage.documents[0].name, 'Documento del expediente');
  assert.equal(result.speech.text, 'Respuesta oral breve.');
  assert.equal(result.speech.durationMs, 3529); assert.equal(result.timings.totalMs, 3410);
  assert.equal((await parseMultipart(h.starts[0])).get('caseId'), '12');
  const restored = h.api.normalizeLuxMessage({ id: 'cmhistory', role: 'assistant', content: 'Historial',
    metadataJson: { citations: contractResponse.citations, documentsUsed: contractResponse.documentsUsed, voiceMode: 'conversation' } });
  assert.equal(restored.citations[0].title, 'Fuente del contrato');
  assert.equal(restored.documents[0].name, 'Documento del expediente');
  assert.equal(restored.voiceMode, 'conversation');
});

test('completed_with_synthesis_error es un turno válido sin perder texto ni fuentes', async (t) => {
  const h = harness(t, 'android', { start: async (response) => { response.responseBody = { ...contractResponse,
    status: 'completed_with_synthesis_error', audioId: null, audioUrl: null, audioDurationMs: null,
    speech: { status: 'unavailable', errorCode: 'SYNTHESIS_FAILED', text: 'Respuesta oral breve.', durationMs: null },
    warnings: ['La respuesta escrita se guardó, pero el audio no pudo generarse.'] }; } });
  const result = await h.voice.luxVoiceTransport.turn(h.recording, requestId,
    { localConversationId: 'local-1' }, 'conversation', true, new AbortController().signal);
  assert.equal(result.status, 'completed_with_synthesis_error');
  assert.equal(result.assistantMessage.text, contractResponse.response);
  assert.equal(result.assistantMessage.documents.length, 1);
  assert.equal(result.speech.status, 'unavailable'); assert.equal(result.speech.errorCode, 'SYNTHESIS_FAILED');
  assert.equal(result.speech.durationMs, null); assert.equal(result.warnings.length, 1);
});

test('una respuesta cancelada nunca se transforma en mensajes válidos', async (t) => {
  const h = harness(t, 'ios', { start: async (response) => { response.responseBody = { ...contractResponse, status: 'cancelled' }; } });
  await assert.rejects(h.voice.luxVoiceTransport.turn(h.recording, requestId,
    { localConversationId: 'local-1' }, 'conversation', true, new AbortController().signal), { code: 'CANCELLED' });
});

for (const [status, code, classification] of [[400, 'INVALID_CASE_ID', 'HTTP_ERROR'], [404, 'CASE_NOT_FOUND', 'HTTP_ERROR'],
  [409, 'REQUEST_IN_PROGRESS', 'HTTP_ERROR'], [410, 'REQUEST_CANCELLED', 'CANCELLED'], [408, 'MULTIPART_TIMEOUT', 'TIMEOUT']]) {
  test(`el error HTTP ${code} conserva diagnóstico seguro y clasificación ${classification}`, async (t) => {
    const h = harness(t, 'ios', { start: async (response) => {
      response.responseStatus = status;
      response.responseBody = { error: { code, message: 'Error del contrato', requestId: 'server-error', retryable: status === 409 } };
    } });
    await assert.rejects(h.voice.luxVoiceTransport.turn(h.recording, requestId,
      { localConversationId: 'local-1' }, 'conversation', true, new AbortController().signal),
    (error) => error.code === (classification === 'HTTP_ERROR' ? code : classification));
    const entry = h.logs.find((log) => log.startsWith('[API HTTP error] '));
    const detail = JSON.parse(entry.slice('[API HTTP error] '.length));
    assert.equal(detail.classification, classification); assert.equal(detail.exceptionCode, code);
    assert.equal(detail.clientRequestId, requestId); assert.equal(detail.audioDurationMs, 1500);
    assert.equal(detail.fileSize, binaryAudio.length); assert.equal(detail.mimeType, 'audio/mp4');
    assert.doesNotMatch(entry, /test-token|file:\/\/|Bearer|recording\.uri/);
  });
}

test('un fallo al leer bytes conserva la excepción original y depura token, URI y stack', async (t) => {
  const original = new Error('Cannot read file:///private/audio.m4a Bearer test-token');
  original.stack += '\n    at readBytes (file:///private/audio.m4a:1:2)\n    at bytes (http://localhost/index.bundle?token=test-token)';
  const h = harness(t, 'ios', { read: async () => { throw original; } });
  await assert.rejects(h.voice.luxVoiceTransport.turn(h.recording, requestId,
    { localConversationId: 'local-1' }, 'message', false, new AbortController().signal),
  (error) => error.code === 'REQUEST_PREPARATION_ERROR' && error.cause === original);
  assert.equal(h.starts.length, 0);
  const detail = failedDiagnostic(h);
  assert.equal(detail.classification, 'REQUEST_PREPARATION_ERROR');
  assert.match(detail.exceptionMessage, /Cannot read/);
  assert.match(detail.exceptionStack, /readBytes/);
  assert.doesNotMatch(JSON.stringify(detail), /test-token|file:\/\/|private\/audio|\?token=/);
});

test('un fallo construyendo File queda dentro de la preparación autenticada y su diagnóstico', async (t) => {
  const original = new TypeError('Invalid native file');
  const h = harness(t, 'ios', { fileConstructorError: original });
  await assert.rejects(h.voice.luxVoiceTransport.turn(h.recording, requestId,
    { localConversationId: 'local-1' }, 'message', false, new AbortController().signal),
  (error) => error.code === 'REQUEST_PREPARATION_ERROR' && error.cause === original);
  assert.equal(h.starts.length, 0);
  assert.equal(failedDiagnostic(h).exceptionName, 'TypeError');
});

test('el controlador conserva audio e ID tras fallar la preparación real y muestra el error correcto', async (t) => {
  let attempts = 0;
  const h = harness(t, 'ios', { read: async () => {
    if (++attempts === 1) throw new Error('Native file temporarily unreadable');
    return new Uint8Array(binaryAudio);
  } });
  const { VoiceController } = h.load(path.join(root, 'src/voice/VoiceController.ts'));
  const pendingIds = [];
  const turns = [];
  let disposed = false;
  h.recording.dispose = async () => { disposed = true; };
  const controller = new VoiceController({ start: async () => {}, stop: async () => h.recording, dispose: async () => {} },
    { stop: async () => {} }, h.voice.luxVoiceTransport, () => requestId, {
      changed() {}, pending(id) { pendingIds.push(id); }, settled() {}, turn(result) { turns.push(result); }, speech() {},
    }, Date.now);
  controller.state.capabilities = {
    enabled: true, transcriptionAvailable: true, synthesisAvailable: false,
    maxAudioBytes: 100000, maxAudioDurationSeconds: 30, acceptedMimeTypes: ['audio/mp4'],
  };
  await controller.begin({ localConversationId: 'local-1' }, false);
  await controller.finishCapture(false);
  await controller.sendDraft();
  assert.equal(controller.state.status, 'error');
  assert.equal(controller.state.draft, h.recording);
  assert.match(controller.state.error, /preparar el audio/);
  assert.doesNotMatch(controller.state.error, /internet|conectar/);
  assert.equal(disposed, false);
  assert.equal(h.starts.length, 0);
  await controller.sendDraft();
  assert.deepEqual(pendingIds, [requestId, requestId]);
  assert.equal(controller.state.draft, null);
  assert.equal(turns.length, 1);
  assert.equal((await parseMultipart(h.starts[0])).get('clientRequestId'), requestId);
});

for (const classification of ['CANCELLED', 'TIMEOUT']) {
  test(`expo/fetch multipart conserva ${classification} y cancela el request nativo`, async (t) => {
    const h = harness(t, 'ios', { start: () => new Promise(() => {}) });
    const caller = new AbortController();
    const body = new h.FormData();
    await h.api.appendFormDataFile(body, 'audio', { uri: h.recording.uri, name: h.recording.name, type: h.recording.mimeType });
    const pending = h.api.request('/lux/voice/turn', {
      method: 'POST', body, signal: caller.signal, timeout: classification === 'TIMEOUT' ? 25 : 1000,
    });
    const rejection = assert.rejects(pending, (error) => error.code === classification && error.status === (classification === 'TIMEOUT' ? 408 : 499));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.starts.length, 1);
    if (classification === 'CANCELLED') caller.abort();
    await rejection;
    assert.equal(h.cancelled, 1);
    assert.equal(failedDiagnostic(h).classification, classification);
  });
}

test('cancelar durante la serialización impide el envío tardío y libera al caller', async (t) => {
  let releaseBytes;
  const h = harness(t, 'ios', { read: () => new Promise((resolve) => { releaseBytes = resolve; }) });
  const caller = new AbortController();
  const pending = h.voice.luxVoiceTransport.turn(h.recording, requestId,
    { localConversationId: 'local-1' }, 'message', false, caller.signal);
  const rejection = assert.rejects(pending, (error) => error.code === 'CANCELLED');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.reads, 1);
  caller.abort();
  await rejection;
  assert.equal(h.starts.length, 0);
  releaseBytes(new Uint8Array(binaryAudio));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.starts.length, 0);
});

test('un signal ya cancelado evita autenticación, lectura y transporte', async (t) => {
  const h = harness(t);
  const caller = new AbortController();
  caller.abort();
  await assert.rejects(h.voice.luxVoiceTransport.turn(h.recording, requestId,
    { localConversationId: 'local-1' }, 'message', false, caller.signal),
  (error) => error.code === 'CANCELLED');
  assert.equal(h.refreshes.length, 0);
  assert.equal(h.reads, 0);
  assert.equal(h.starts.length, 0);
});

test('multipart descarta Content-Type manual y deja el boundary al transporte', async (t) => {
  const h = harness(t);
  const body = new h.FormData();
  await h.api.appendFormDataFile(body, 'audio', { uri: h.recording.uri, name: h.recording.name, type: h.recording.mimeType });
  await h.api.request('/lux/voice/turn', {
    method: 'POST', body, headers: { 'cOnTeNt-TyPe': 'multipart/form-data; boundary=incorrect' },
  });
  const headers = new Headers(h.starts[0].init.headers);
  assert.doesNotMatch(headers.get('Content-Type'), /incorrect/);
  assert.deepEqual(Buffer.from(await (await parseMultipart(h.starts[0])).get('audio').arrayBuffer()), binaryAudio);
});

test('los otros productores multipart del API comparten la representación compatible', async (t) => {
  const h = harness(t);
  const audio = { audioUri: h.recording.uri, chunkIndex: 0, startTime: 0, endTime: 1.5 };
  await h.api.uploadLiveTranscriptionChunk({ ...audio, sessionId: 'session-1' });
  await h.api.uploadHearingLiveTranscriptionChunk({ ...audio, hearingId: 'hearing-1' });
  assert.equal(h.starts.length, 2);
  for (const start of h.starts) {
    const form = await parseMultipart(start);
    assert.deepEqual(Buffer.from(await form.get('audio').arrayBuffer()), binaryAudio);
    assert.equal(form.get('chunkIndex'), '0');
    assert.equal(new Headers(start.init.headers).get('Authorization'), 'Bearer test-token');
  }
  assert.equal(h.globalFetchCalls, 0);
});

test('iOS: controlador → multipart Expo → respuesta escrita/documentos → audio autenticado → reproducción → escucha', async (t) => {
  const responseAudio = Uint8Array.from([73, 68, 51, 0, 255, 128, 3]);
  const players = [];
  let recordingActive = false;
  const h = harness(t, 'ios', {
    globalExpoFetch: true, realAudio: true,
    audioModule: {
      setAudioModeAsync: async (mode) => { assert.equal(mode.allowsRecording, false); },
      createAudioPlayer(uri) {
        assert.equal(recordingActive, false, 'Lux must never play while the microphone records');
        const player = { uri, removed: false, listener: null,
          addListener(event, listener) {
            assert.equal(event, 'playbackStatusUpdate'); player.listener = listener;
            return { remove() { player.listener = null; } };
          },
          play() { player.listener({ isLoaded: true }); }, pause() {},
          remove() { player.removed = true; },
        };
        players.push(player); return player;
      },
    },
    async start(response, _count, request) {
      assert.equal(new Headers(request.init.headers).get('Authorization'), 'Bearer test-token');
      if (request.url.endsWith('/capabilities')) {
        response.responseBody = { enabled: true, transcriptionAvailable: true, synthesisAvailable: true,
          maxAudioBytes: 100000, maxAudioDurationSeconds: 30, acceptedMimeTypes: ['audio/mp4'] };
      } else if (request.url.endsWith('/turn')) {
        const form = await parseMultipart(request);
        assert.equal(form.get('mode'), 'conversation');
        assert.equal(form.get('responseAudio'), 'true');
        assert.equal(form.get('clientRequestId'), requestId);
        assert.deepEqual(Buffer.from(await form.get('audio').arrayBuffer()), binaryAudio);
        response.responseBody = { ...turnResponse,
          assistantMessage: { ...turnResponse.assistantMessage,
            documents: [{ name: 'Documento del expediente', url: 'https://api.test/document.pdf' }],
            citations: [{ title: 'Fuente jurídica', url: 'https://api.test/source' }] },
          speech: { status: 'ready', text: 'Respuesta', audioId: 'audio-1', mimeType: 'audio/mpeg', durationMs: 900 },
        };
      } else if (request.url.endsWith('/audio/audio-1')) {
        response.responseHeaders = [['Content-Type', 'audio/mpeg']];
        response.responseBytes = responseAudio;
      } else { assert.fail(`Unexpected endpoint: ${request.url}`); }
    },
  });
  const { VoiceController } = h.load(path.join(root, 'src/voice/VoiceController.ts'));
  const { createPlayback } = h.load(path.join(root, 'src/voice/createPlayback.ts'));
  const { reconcileVoiceMessages } = h.load(path.join(root, 'src/voice/voicePolicy.ts'));
  let messages = [];
  const controller = new VoiceController({
    start: async () => { recordingActive = true; },
    stop: async () => { recordingActive = false; return h.recording; },
    dispose: async () => { recordingActive = false; },
  }, createPlayback(), h.voice.luxVoiceTransport, () => requestId, {
    changed() {}, speech() {},
    pending(id) { messages.push({ id: `voice-${id}`, clientRequestId: id, optimistic: true }); },
    settled(id) { messages = messages.filter((message) => message.id !== `voice-${id}`); },
    turn(result, id) { messages = reconcileVoiceMessages(messages, id, [result.userMessage, result.assistantMessage]); },
  }, Date.now);
  t.after(() => controller.close());
  await controller.loadCapabilities();
  await controller.begin({ localConversationId: 'same-existing-chat' }, true);
  await controller.finishCapture(true);
  assert.equal(messages.length, 2);
  assert.equal(new Set(messages.map((message) => message.id)).size, 2);
  assert.equal(messages[0].text, 'Consulta hablada');
  assert.equal(messages[1].text, 'Respuesta');
  assert.equal(messages[1].documents[0].name, 'Documento del expediente');
  assert.equal(messages[1].citations[0].title, 'Fuente jurídica');
  assert.equal(controller.state.status, 'speaking');
  assert.equal(players.length, 1);
  assert.deepEqual(fs.readFileSync(fileURLToPath(players[0].uri)), Buffer.from(responseAudio));
  const completed = players[0].listener;
  completed({ isLoaded: true, didJustFinish: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(players[0].removed, true);
  assert.equal(fs.existsSync(fileURLToPath(players[0].uri)), false);
  assert.equal(controller.state.status, 'listening');
  assert.equal(recordingActive, true);
  assert.equal(controller.scope.conversationId, 'remote-conversation');
  assert.deepEqual(h.starts.map((request) => new URL(request.url).pathname), [
    '/api/v1/lux/voice/capabilities', '/api/v1/lux/voice/turn', '/api/v1/lux/voice/audio/audio-1',
  ]);
  await controller.close();
  assert.equal(recordingActive, false);
  assert.equal(controller.state.conversation, false);
  assert.equal(messages.length, 2, 'Ending voice mode keeps the chat history');
});
