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

function loadApi(fetchImplementation, diagnosticLogs = []) {
  const apiPath = path.join(root, 'src/services/api.js');
  const transformed = babel.transformSync(fs.readFileSync(apiPath, 'utf8'), {
    filename: apiPath,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const module = { exports: {} };

  vm.runInNewContext(transformed, {
    AbortController,
    Date,
    FormData,
    JSON,
    Map,
    Number,
    Object,
    Promise,
    Set,
    String,
    Uint8Array,
    URLSearchParams,
    clearTimeout,
    __DEV__: true,
    console: {
      log: (...args) => diagnosticLogs.push(['log', ...args]),
      warn: (...args) => diagnosticLogs.push(['warn', ...args]),
      info: (...args) => diagnosticLogs.push(['info', ...args]),
      error: (...args) => diagnosticLogs.push(['error', ...args]),
    },
    fetch: fetchImplementation,
    module,
    exports: module.exports,
    require: (request) => {
      if (request === 'react-native') return { Platform: { OS: 'web' } };
      if (request === 'expo/fetch') return { fetch: () => { throw new Error('Unexpected native transport on web'); } };
      if (request === 'expo-file-system') return { File: class {} };
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
  });

  return module.exports;
}

test('el chat usa POST /api/v1/lux/chat, Firebase y el contrato message/conversationId', async () => {
  let captured;
  const api = loadApi(async (url, options) => {
    captured = { url: String(url), options };
    return jsonResponse(200, {
      success: true,
      data: { answer: 'Hola, soy LUX.', conversationId: 'conv-123' },
    });
  });
  api.setAuthState('authenticated');

  const result = await api.sendGeneralLuxMessage('hola lux', { conversationId: 'conv-123', mode: 'general' });
  const body = JSON.parse(captured.options.body);

  assert.equal(captured.url, 'https://api.test/api/v1/lux/chat');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers.Authorization, 'Bearer test-token');
  assert.deepEqual(body.message, 'hola lux');
  assert.equal(body.conversationId, 'conv-123');
  assert.equal(body.context.conversationId, 'conv-123');
  assert.equal(result.reply, 'Hola, soy LUX.');
  assert.equal(result.conversationId, 'conv-123');
});

test('el chat no envia identificadores de conversaciones locales al backend', async () => {
  let captured;
  const api = loadApi(async (url, options) => {
    captured = { url: String(url), options };
    return jsonResponse(200, {
      success: true,
      reply: 'Hola. ¿En qué te ayudo?',
    });
  });
  api.setAuthState('authenticated');

  await api.sendGeneralLuxMessage('hola', {
    conversationId: 'local-conversation-123',
    mode: 'legal',
  });

  const body = JSON.parse(captured.options.body);
  assert.equal(body.conversationId, undefined);
  assert.equal(body.context.conversationId, undefined);
  assert.equal(captured.options.headers.Authorization, 'Bearer test-token');
});

test('el chat propaga el status HTTP y no devuelve el fallback generico', async () => {
  const api = loadApi(async () => jsonResponse(500, { success: false, error: 'error interno' }));
  api.setAuthState('authenticated');

  await assert.rejects(
    api.sendGeneralLuxMessage('hola lux', { conversationId: 'conv-123' }),
    (error) => error?.status === 500 && error?.message !== 'No pude conectarme con LUX en este momento.'
  );
});

test('una respuesta 200 sin texto se clasifica como error de parseo', async () => {
  const api = loadApi(async () => jsonResponse(200, { success: true, data: {} }));
  api.setAuthState('authenticated');

  await assert.rejects(
    api.sendGeneralLuxMessage('hola lux', { conversationId: 'conv-123' }),
    (error) => error?.code === 'RESPONSE_PARSE_ERROR' && error?.status === 502
  );
});

test('voz usa multipart autenticado sin fijar el boundary', async () => {
  let captured;
  const api = loadApi(async (url, options) => {
    captured = { url: String(url), options };
    return jsonResponse(200, { ok: true });
  });
  api.setAuthState('authenticated');
  const form = new FormData();
  form.append('clientRequestId', 'request-1');

  await api.request('/lux/voice/turn', { method: 'POST', body: form, timeout: 5000 });

  assert.equal(captured.url, 'https://api.test/api/v1/lux/voice/turn');
  assert.equal(captured.options.headers.Authorization, 'Bearer test-token');
  assert.equal(captured.options.body, form);
  assert.equal(captured.options.headers['Content-Type'], undefined);
});

test('audio de voz se descarga autenticado y valida el MIME binario', async () => {
  let captured;
  const api = loadApi(async (url, options) => {
    captured = { url: String(url), options };
    return {
      ok: true,
      status: 200,
      headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'audio/mpeg' : null },
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    };
  });
  api.setAuthState('authenticated');

  const result = await api.request('/lux/voice/audio/audio-1', { responseType: 'audio', headers: { Accept: 'audio/*' } });

  assert.equal(captured.options.headers.Authorization, 'Bearer test-token');
  assert.equal(captured.options.headers.Accept, 'audio/*');
  assert.equal(result.mimeType, 'audio/mpeg');
  assert.deepEqual(Array.from(result.bytes), [1, 2, 3]);
});

test('el deadline único clasifica timeout y registra duración sin exponer el token', async () => {
  const logs = [];
  const api = loadApi((_url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  }), logs);
  api.setAuthState('authenticated');

  await assert.rejects(
    api.request('/lux/voice/turn', {
      method: 'POST',
      body: new FormData(),
      timeout: 25,
      diagnostics: { clientRequestId: 'request-timeout', fileSize: 321, mimeType: 'audio/mp4' },
    }),
    (error) => error?.code === 'TIMEOUT' && error?.status === 408
  );

  const entry = logs.find((item) => String(item[1]).startsWith('[API request failed]'));
  assert.ok(entry);
  const detail = JSON.parse(String(entry[1]).slice(String(entry[1]).indexOf('{')));
  assert.equal(detail.classification, 'TIMEOUT');
  assert.equal(detail.clientRequestId, 'request-timeout');
  assert.equal(detail.fileSize, 321);
  assert.equal(detail.mimeType, 'audio/mp4');
  assert.equal(detail.timeoutMs, 25);
  assert.ok(detail.durationMs >= 20);
  assert.equal(String(entry[1]).includes('test-token'), false);
});

test('cancelación y error de transporte conservan clasificaciones distintas', async () => {
  const cancellationLogs = [];
  const cancelApi = loadApi((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  }), cancellationLogs);
  cancelApi.setAuthState('authenticated');
  const controller = new AbortController();
  const pending = cancelApi.request('/lux/voice/turn', { signal: controller.signal, timeout: 1000 });
  controller.abort();
  await assert.rejects(pending, (error) => error?.code === 'CANCELLED' && error?.status === 499);
  assert.ok(cancellationLogs.some((item) => String(item[1]).includes('"classification":"CANCELLED"')));

  const networkLogs = [];
  const networkApi = loadApi(async () => { throw new TypeError('Network request failed'); }, networkLogs);
  networkApi.setAuthState('authenticated');
  await assert.rejects(
    networkApi.request('/lux/voice/turn', { timeout: 1000 }),
    (error) => error?.code === 'NETWORK_ERROR' && error?.status === 0
  );
  const networkEntry = networkLogs.find((item) => String(item[1]).includes('"classification":"NETWORK_ERROR"'));
  assert.ok(networkEntry);
  assert.match(String(networkEntry[1]), /"exceptionName":"TypeError"/);
});
