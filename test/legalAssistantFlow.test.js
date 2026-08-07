const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');

function loadApi(fetchImplementation) {
  const apiPath = path.join(root, 'src/services/api.js');
  const transformed = babel.transformSync(fs.readFileSync(apiPath, 'utf8'), {
    filename: apiPath,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const module = { exports: {} };
  vm.runInNewContext(transformed, {
    AbortController, Date, FormData, JSON, Map, Number, Object, Promise, String,
    URLSearchParams, clearTimeout, console: { warn: () => undefined },
    fetch: fetchImplementation, module, exports: module.exports,
    require: (request) => {
      if (request === '../config/api') return { API_BASE_URL: 'https://api.test/api/v1', API_ROOT_URL: 'https://api.test' };
      if (request === '../config/firebase') return { auth: { currentUser: { getIdToken: async () => 'test-token' } } };
      if (request === 'firebase/auth') return { signOut: async () => undefined };
      if (request === '../data/mockData') return [];
      if (request === '../utils/status') return { normalizeStatusLabel: (value) => value };
      if (request === '../utils/userDisplay') return { getUserDisplayName: () => '', getUserEmail: () => '', getUserRole: () => '' };
      throw new Error(`Modulo no esperado: ${request}`);
    },
    setTimeout,
  });
  return module.exports;
}

test('la consulta juridica usa el endpoint y token existentes con conversationId', async () => {
  let captured;
  const api = loadApi(async (url, options) => {
    captured = { url, options };
    return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, data: { answer: 'Respuesta', legalCitations: [] } }) };
  });
  api.setAuthState('ready');
  await api.queryLegalAssistant({ question: 'Que dice la ley?', conversationId: 'legal-test-1' });
  assert.equal(captured.url, 'https://api.test/api/v1/lux/legal/query');
  assert.equal(captured.options.headers.Authorization, 'Bearer test-token');
  assert.deepEqual(JSON.parse(captured.options.body), { question: 'Que dice la ley?', conversationId: 'legal-test-1' });
});

test('el cliente conserva los estados HTTP para que la interfaz los traduzca', async () => {
  const api = loadApi(async () => ({ ok: false, status: 429, text: async () => JSON.stringify({ error: 'rate limit' }) }));
  api.setAuthState('ready');
  await assert.rejects(() => api.queryLegalAssistant({ question: 'Consulta' }), (error) => error.status === 429);
});
