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

function loadApi(fetchImplementation) {
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
