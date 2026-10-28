const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function loadApi(fetchImplementation, { browser = false, FormDataConstructor = FormData } = {}) {
  const apiPath = path.join(root, 'src/services/api.js');
  const transformed = babel.transformSync(fs.readFileSync(apiPath, 'utf8'), {
    filename: apiPath,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const module = { exports: {} };
  const context = {
    AbortController,
    Blob,
    Date,
    FormData: FormDataConstructor,
    JSON,
    Map,
    Number,
    Object,
    Promise,
    Set,
    String,
    URLSearchParams,
    clearTimeout,
    console: { log: () => undefined, warn: () => undefined, info: () => undefined, error: () => undefined },
    fetch: fetchImplementation,
    module,
    exports: module.exports,
    require: (request) => {
      if (request === '../config/api') {
        return { API_BASE_URL: 'https://api.test/api/v1', API_ROOT_URL: 'https://api.test' };
      }
      if (request === '../config/captureMode') return { IS_CAPTURE_MODE: false };
      if (request === '../config/firebase') {
        return { auth: { currentUser: { getIdToken: async () => 'test-token' } } };
      }
      if (request === 'firebase/auth') return { signOut: async () => undefined };
      if (request === '../data/mockData') return [];
      if (request === '../utils/status') return { normalizeStatusLabel: (value) => value || 'Pendiente' };
      if (request === '../utils/userDisplay') {
        return {
          getUserDisplayName: () => 'Usuario',
          getUserEmail: () => 'usuario@example.test',
          getUserRole: () => 'Profesional',
        };
      }
      throw new Error(`Modulo no esperado en la prueba: ${request}`);
    },
    setTimeout,
  };
  if (browser) context.window = { document: {} };
  vm.runInNewContext(transformed, context);
  return module.exports;
}

test('el inicio desde audiencia usa la ruta canónica y conserva el id real de sesión', async () => {
  let captured;
  const api = loadApi(async (url, options) => {
    captured = { url: String(url), options };
    return jsonResponse(200, { success: true, sessionId: 73, session: { id: 73, status: 'recording' } });
  });
  api.setAuthState('authenticated');

  const result = await api.startHearingLiveTranscription({
    caseDetail: { id: 4 },
    hearing: { id: 19, caseId: 4, title: 'Audiencia de prueba' },
  });

  assert.equal(captured.url, 'https://api.test/api/v1/transcriptions/start');
  assert.equal(JSON.parse(captured.options.body).hearingId, '19');
  assert.equal(JSON.parse(captured.options.body).caseId, '4');
  assert.equal(result.hearingId, '19');
  assert.equal(result.sessionId, '73');
  assert.notEqual(result.sessionId, result.hearingId);
});

test('el bloque web es un Blob no vacío con MIME y extensión reales en la ruta de sesión', async () => {
  let captured;
  const api = loadApi(async (url, options) => {
    captured = { url: String(url), options };
    return jsonResponse(200, { success: true, chunkIndex: 2, startTime: 10, endTime: 14, text: 'texto reconocido' });
  }, { browser: true });
  api.setAuthState('authenticated');

  const audio = new Blob(['audio bytes'], { type: 'audio/webm;codecs=opus' });
  const result = await api.uploadHearingLiveTranscriptionChunk({
    audioFile: audio,
    audioMimeType: audio.type,
    chunkIndex: 2,
    endTime: 14,
    hearingId: 19,
    sessionId: 73,
    startTime: 10,
  });
  const uploaded = captured.options.body.get('audio');

  assert.equal(captured.url, 'https://api.test/api/v1/transcriptions/73/chunk');
  assert.equal(captured.options.headers['Content-Type'], undefined);
  assert.equal(uploaded.size, audio.size);
  assert.equal(uploaded.type, 'audio/webm;codecs=opus');
  assert.match(uploaded.name, /\.webm$/);
  assert.equal(captured.options.body.get('chunkIndex'), '2');
  assert.equal(result.text, 'texto reconocido');
});

test('el adaptador lee la URL temporal del recorder y adjunta su Blob real', async () => {
  let captured;
  const audio = new Blob(['grabación'], { type: 'audio/webm' });
  const api = loadApi(async (url, options) => {
    if (String(url) === 'blob:recorder-chunk') {
      return { ok: true, status: 200, blob: async () => audio };
    }
    captured = { url: String(url), options };
    return jsonResponse(200, { success: true, chunkIndex: 0, text: 'hola' });
  }, { browser: true });
  api.setAuthState('authenticated');

  await api.uploadLiveTranscriptionChunk({
    sessionId: 73,
    audioUri: 'blob:recorder-chunk',
    chunkIndex: 0,
    startTime: 0,
    endTime: 2.2,
  });
  const uploaded = captured.options.body.get('audio');

  assert.equal(captured.url, 'https://api.test/api/v1/transcriptions/73/chunk');
  assert.equal(uploaded.size, audio.size);
  assert.equal(uploaded.type, 'audio/webm');
  assert.match(uploaded.name, /\.webm$/);
});

test('el adaptador nativo conserva uri, nombre y MIME de FormData de React Native', async () => {
  class NativeFormData {
    constructor() { this.entries = []; }
    append(name, value) { this.entries.push([name, value]); }
    get(name) { return this.entries.find(([key]) => key === name)?.[1]; }
  }
  let captured;
  const api = loadApi(async (url, options) => {
    captured = { url: String(url), options };
    return jsonResponse(200, { success: true, chunkIndex: 0, text: 'hola' });
  }, { FormDataConstructor: NativeFormData });
  api.setAuthState('authenticated');

  await api.uploadLiveTranscriptionChunk({
    sessionId: 73,
    audioUri: 'file:///cache/chunk.m4a',
    audioName: 'bloque.m4a',
    audioMimeType: 'audio/mp4',
    chunkIndex: 0,
    startTime: 0,
    endTime: 2.2,
  });
  const uploaded = captured.options.body.get('audio');

  assert.equal(captured.url, 'https://api.test/api/v1/transcriptions/73/chunk');
  assert.equal(uploaded.uri, 'file:///cache/chunk.m4a');
  assert.equal(uploaded.name, 'bloque.m4a');
  assert.equal(uploaded.type, 'audio/mp4');
});

test('la recuperación normaliza bloques anidados bajo session y conserva el texto ordenado', async () => {
  let capturedUrl;
  const api = loadApi(async (url) => {
    capturedUrl = String(url);
    return jsonResponse(200, {
      success: true,
      session: {
        id: 73,
        status: 'finished',
        chunks: [
          { chunkIndex: 1, startTime: 5, endTime: 8, text: 'segundo' },
          { chunkIndex: 0, startTime: 0, endTime: 4, text: 'primero' },
        ],
      },
    });
  });
  api.setAuthState('authenticated');

  const result = await api.getLiveTranscription(73);

  assert.equal(capturedUrl, 'https://api.test/api/v1/transcriptions/73?scope=personal');
  assert.equal(result.sessionId, '73');
  assert.deepEqual(result.chunks.map((chunk) => chunk.chunkIndex), [0, 1]);
  assert.equal(result.fullText, 'primero\nsegundo');
});

test('la audiencia normaliza la sesión más reciente que devuelve el backend', async () => {
  let capturedUrl;
  const api = loadApi(async (url) => {
    capturedUrl = String(url);
    return jsonResponse(200, {
      success: true,
      hearingId: 19,
      sessionId: 73,
      status: 'finished',
      chunks: [
        { chunkIndex: 0, text: 'acta inicial' },
        { chunkIndex: 1, text: 'continuación' },
      ],
      text: 'acta inicial\ncontinuación',
    });
  });
  api.setAuthState('authenticated');

  const result = await api.getHearingTranscription(19);

  assert.equal(capturedUrl, 'https://api.test/api/v1/audiencias/19/transcripcion');
  assert.equal(result.sessionId, 73);
  assert.equal(result.status, 'finished');
  assert.equal(result.text, 'acta inicial\ncontinuación');
  assert.equal(result.hasTranscript, true);
});

test('rechaza un archivo web vacío sin enviar la petición', async () => {
  let requests = 0;
  const api = loadApi(async () => {
    requests += 1;
    return jsonResponse(200, { success: true });
  }, { browser: true });
  api.setAuthState('authenticated');

  await assert.rejects(
    api.uploadLiveTranscriptionChunk({
      sessionId: 73,
      audioFile: new Blob([], { type: 'audio/webm' }),
      chunkIndex: 0,
      startTime: 0,
      endTime: 0,
    }),
    (error) => error?.status === 400
  );
  assert.equal(requests, 0);
});
