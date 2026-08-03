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
  const source = fs.readFileSync(apiPath, 'utf8');
  const transformed = babel.transformSync(source, {
    filename: apiPath,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const module = { exports: {} };
  const localRequire = (request) => {
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
  };

  vm.runInNewContext(transformed, {
    AbortController,
    Date,
    FormData,
    JSON,
    Map,
    Number,
    Object,
    Promise,
    String,
    URLSearchParams,
    clearTimeout,
    console: { warn: () => undefined },
    fetch: fetchImplementation,
    module,
    exports: module.exports,
    require: localRequire,
    setTimeout,
  });
  return module.exports;
}

test('el cliente interpreta el contrato paginado y conserva IDs UUID/CUID como strings', () => {
  const { normalizePaginatedResponse } = loadApi(async () => jsonResponse(200, []));
  const page = normalizePaginatedResponse(
    {
      items: [{ id: 'clz9x_abc-123', title: 'Causa identificable' }],
      total: 1,
      page: 1,
      limit: 100,
      totalPages: 1,
    },
    (item) => item
  );

  assert.deepEqual(page.items, [{ id: 'clz9x_abc-123', title: 'Causa identificable' }]);
  assert.equal(page.total, 1);
  assert.equal(page.totalPages, 1);
});

test('getAllCases recorre todas las paginas, no duplica y preserva IDs string', async () => {
  const calls = [];
  const pages = [
    { items: [{ id: 'uuid-a', title: 'A', createdAt: '2026-08-01T00:00:00.000Z' }, { id: 'cuid-b', title: 'B', createdAt: '2026-08-02T00:00:00.000Z' }], total: 4, page: 1, limit: 100, totalPages: 3 },
    { items: [{ id: 'cuid-b', title: 'B', createdAt: '2026-08-02T00:00:00.000Z' }, { id: 'uuid-c', title: 'C', createdAt: '2026-08-03T00:00:00.000Z' }], total: 4, page: 2, limit: 100, totalPages: 3 },
    { items: [{ id: 'uuid-d', title: 'D', createdAt: '2026-08-04T00:00:00.000Z' }], total: 4, page: 3, limit: 100, totalPages: 3 },
  ];
  const api = loadApi(async (url) => {
    calls.push(String(url));
    const page = Number(new URL(String(url)).searchParams.get('page')) || 1;
    return jsonResponse(200, pages[page - 1]);
  });
  api.setAuthState('authenticated');

  const cases = await api.getAllCases();

  assert.equal(calls.length, 3);
  assert.equal(JSON.stringify(cases.map((item) => item.id)), JSON.stringify(['uuid-d', 'uuid-c', 'cuid-b', 'uuid-a']));
  assert.ok(cases.every((item) => typeof item.id === 'string'));
});

test('errores 401, 403 y 500 se propagan; no se convierten en una lista vacia', async () => {
  for (const status of [401, 403, 500]) {
    const api = loadApi(async () => jsonResponse(status, { error: 'error de prueba' }));
    api.setAuthState('authenticated');
    await assert.rejects(api.getAllCases(), (error) => error?.status === status);
  }
});

test('los componentes usan el resultado exitoso, conservan estados de error y recargan al recuperar foco', () => {
  const hearingSource = fs.readFileSync(path.join(root, 'src/screens/NewHearingScreen.js'), 'utf8');
  const caseSource = fs.readFileSync(path.join(root, 'src/screens/NewCaseScreen.js'), 'utf8');
  const calendarSource = fs.readFileSync(path.join(root, 'src/screens/CalendarScreen.js'), 'utf8');

  assert.match(hearingSource, /useFocusEffect/);
  assert.match(hearingSource, /const items = await getAllCases\(\);/);
  assert.match(hearingSource, /updateField\('caseId', String\(item\?\.id\)\)/);
  assert.match(hearingSource, /item\?\.title \|\| 'Causa sin titulo'/);
  assert.ok(
    hearingSource.indexOf('if (casesError && !cases.length)') < hearingSource.indexOf('if (!cases.length)'),
    'un error debe renderizarse antes que el estado vacio'
  );
  assert.match(caseSource, /selectStudyContext\(selectedStudy\)/);
  assert.match(caseSource, /selectPersonalContext\(\)/);
  assert.match(calendarSource, /getAllCases\(\)/);
});
