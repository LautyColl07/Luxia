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

test('deleteDocument envía DELETE autenticado en el contexto seleccionado', async () => {
  const api = loadApi(async (url, options) => {
    assert.equal(url, 'https://api.test/api/v1/documentos/9?scope=study&legalStudyId=study-a');
    assert.equal(options.method, 'DELETE');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(options.body, undefined);
    return jsonResponse(200, { success: true, data: { id: 9 } });
  });
  api.setAuthState('authenticated');
  api.setApiWorkContext({ type: 'study', legalStudyId: 'study-a' });
  assert.equal((await api.deleteDocument('9')).data.id, 9);
});

test('deleteDocument rechaza IDs inválidos sin enviar solicitudes', async () => {
  const api = loadApi(async () => { throw new Error('No debe enviar una solicitud'); });
  for (const id of [null, '', 0, -1, 1.5, 'invalid']) {
    await assert.rejects(api.deleteDocument(id), /ID de documento inválido/);
  }
});

test('deleteDocument conserva los errores de permiso y procesamiento del backend', async () => {
  for (const [status, error] of [[404, 'Recurso no encontrado'], [409, 'El documento está siendo procesado']]) {
    const api = loadApi(async () => jsonResponse(status, { error }));
    api.setAuthState('authenticated');
    await assert.rejects(api.deleteDocument(9), (failure) => failure.status === status && failure.message === error);
  }
});

test('joinLegalStudy usa la ruta autenticada y conserva el ID y nombre devueltos por el backend', async () => {
  for (const payload of [
    { success: true, data: { id: 'study-uuid', name: 'Estudio Sur' } },
    { id: 'study-uuid', name: 'Estudio Sur' },
  ]) {
    const api = loadApi(async (url, options) => {
      assert.equal(url, 'https://api.test/api/v1/legal-studies/join');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      assert.deepEqual(JSON.parse(options.body), { name: 'Estudio   Sur' });
      return jsonResponse(201, payload);
    });
    api.setAuthState('authenticated');
    const study = await api.joinLegalStudy('  Estudio   Sur  ');
    assert.equal(study.id, 'study-uuid');
    assert.equal(study.name, 'Estudio Sur');
  }
});

test('joinLegalStudy rechaza respuestas incompletas sin inventar identificadores', async () => {
  const api = loadApi(async () => jsonResponse(201, { success: true, data: {} }));
  api.setAuthState('authenticated');
  await assert.rejects(api.joinLegalStudy('Sur'), /no devolvio el estudio/);
});

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

test('dashboard resumen es una ruta protegida y envia el token Firebase', async () => {
  let captured;
  const api = loadApi(async (url, options) => {
    captured = { url: String(url), options };
    return jsonResponse(200, {
      usuario: { nombre: 'Usuario' },
      metricas: { causasActivas: 1, audienciasHoy: 0, documentos: 0, tareasPendientes: 0 },
      proximasAudiencias: [],
    });
  });
  api.setAuthState('authenticated');

  await api.getDashboardResumen();

  assert.equal(captured.url, 'https://api.test/api/v1/dashboard/resumen?scope=personal');
  assert.equal(captured.options.headers.Authorization, 'Bearer test-token');
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
  assert.match(caseSource, /scope === 'LEGAL_STUDY' && studyId/);
  assert.doesNotMatch(caseSource, /selectStudyContext|selectPersonalContext/);
  assert.match(calendarSource, /getAllCases\(\)/);
});

test('la carga de documentos conserva el caso y contempla native, web y reintento', () => {
  const caseSource = fs.readFileSync(path.join(root, 'src/screens/CaseDetailScreen.js'), 'utf8');
  const uploadSource = fs.readFileSync(path.join(root, 'src/screens/UploadDocumentScreen.js'), 'utf8');
  const apiSource = fs.readFileSync(path.join(root, 'src/services/api.js'), 'utf8');

  assert.match(caseSource, /navigate\('UploadDocument', \{ caseId: caseDetail\?\.id \}\)/);
  assert.match(uploadSource, /getCaseById\(caseId\)/);
  assert.match(uploadSource, /Subiendo documento…/);
  assert.match(uploadSource, /Documento agregado al caso correctamente/);
  assert.match(uploadSource, /Reintentar/);
  assert.match(uploadSource, /beforeRemove/);
  assert.match(apiSource, /appendFormDataFile/);
  assert.match(apiSource, /caseId\)/);
  assert.match(apiSource, /timeout: 180000/);
});

test('el contexto global llega a causas, audiencias, documentos y dashboard', async () => {
  const calls = [];
  const api = loadApi(async (url) => {
    calls.push(String(url));
    if (String(url).includes('/dashboard/resumen')) return jsonResponse(200, {
      usuario: { nombre: 'Usuario' }, metricas: {}, proximasAudiencias: [],
    });
    if (String(url).includes('/causas')) return jsonResponse(200, { items: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    return jsonResponse(200, []);
  });
  api.setAuthState('authenticated');
  api.setApiWorkContext({ type: 'study', legalStudyId: 'study-a', name: 'Estudio A' });
  await Promise.all([api.getCases(), api.getHearings(), api.getDocuments(), api.getDashboardResumen()]);
  assert.equal(calls.length, 4);
  assert.ok(calls.every((url) => url.includes('scope=study') && url.includes('legalStudyId=study-a')));

  calls.length = 0;
  api.setApiWorkContext({ type: 'personal' });
  await Promise.all([api.getCases(), api.getHearings(), api.getDocuments(), api.getDashboardResumen()]);
  assert.equal(calls.length, 4);
  assert.ok(calls.every((url) => url.includes('scope=personal') && !url.includes('legalStudyId=')));
});

test('el contrato documental privado conserva nombre original, MIME, bytes, fecha y URL autorizada', async () => {
  const api = loadApi(async (url, options) => {
    assert.equal(String(url), 'https://api.test/api/v1/documentos?scope=personal');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    return jsonResponse(200, [{
      id: 7, fileName: '1791893716436-Entrevista.pdf', originalName: 'Entrevista.pdf',
      filename: 'Entrevista.pdf', mimeType: 'application/pdf', sizeBytes: 2048,
      createdAt: '2026-10-13T12:00:00.000Z', path: null,
      downloadUrl: '/api/v1/documentos/7/download', caseId: 2, caseTitle: 'Causa personal 1', hearingId: 3,
    }]);
  });
  api.setAuthState('authenticated');
  const [document] = await api.getDocuments();
  assert.equal(document.originalName, 'Entrevista.pdf');
  assert.equal(document.mimeType, 'application/pdf');
  assert.equal(document.sizeBytes, 2048);
  assert.equal(document.uploadedAt, '2026-10-13T12:00:00.000Z');
  assert.equal(document.downloadUrl, '/api/v1/documentos/7/download');
  assert.equal(document.caseTitle, 'Causa personal 1');
});

test('consultas simultáneas idénticas de causas comparten una solicitud y se separan por contexto', async () => {
  const calls = [];
  const api = loadApi(async (url) => {
    calls.push(String(url));
    await new Promise((resolve) => setTimeout(resolve, 10));
    return jsonResponse(200, { items: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  });
  api.setAuthState('authenticated');
  await Promise.all([api.getCases(null, { page: 1, limit: 20 }), api.getCases(null, { page: 1, limit: 20 })]);
  assert.equal(calls.length, 1);
  api.setApiWorkContext({ type: 'study', legalStudyId: 'study-a' });
  await api.getCases(null, { page: 1, limit: 20 });
  assert.equal(calls.length, 2);
  assert.match(calls[1], /scope=study/);
});

test('documentos envía categorías CSV y orden válidos con Bearer y el contexto de estudio codificado', async () => {
  const api = loadApi(async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.pathname, '/api/v1/documentos');
    assert.equal(parsed.searchParams.get('scope'), 'study');
    assert.equal(parsed.searchParams.get('legalStudyId'), 'estudio & sur/á');
    assert.equal(parsed.searchParams.get('categories'), 'demanda,escrito');
    assert.equal(parsed.searchParams.getAll('categories').length, 1);
    assert.equal(parsed.searchParams.has('category'), false);
    assert.equal(parsed.searchParams.get('sortBy'), 'name_asc');
    assert.equal(parsed.searchParams.get('search'), 'Contrato %_\\ & Pérez');
    assert.equal(parsed.searchParams.has('page'), false);
    assert.equal(parsed.searchParams.has('limit'), false);
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    return jsonResponse(200, []);
  });
  api.setAuthState('authenticated');
  api.setApiWorkContext({ type: 'study', legalStudyId: 'estudio & sur/á' });
  assert.equal((await api.getDocuments({ categories: ['demanda', 'escrito'], sortBy: 'name_asc',
    search: '  Contrato %_\\ & Pérez  ' })).length, 0);
});

test('los cuatro órdenes documentales conservan exactamente el orden del servidor y las categorías reales', async () => {
  for (const sortBy of ['newest', 'oldest', 'name_asc', 'name_desc']) {
    const api = loadApi(async (url) => {
      const query = new URL(url).searchParams;
      assert.equal(query.get('scope'), 'personal');
      assert.equal(query.get('sortBy'), sortBy);
      assert.equal(query.has('categories'), false);
      return jsonResponse(200, [
        { id: 9, originalName: null, fileName: 'histórico.pdf', category: null, createdAt: '2025-01-01' },
        { id: 2, originalName: 'Árbol.pdf', category: 'prueba', createdAt: '2026-10-13' },
        { id: 7, originalName: 'arbol.pdf', category: 'anexo', createdAt: '2026-01-01' },
      ]);
    });
    api.setAuthState('authenticated');
    const documents = await api.getDocuments({ categories: [], sortBy });
    assert.equal(JSON.stringify(documents.map((item) => item.id)), '[9,2,7]');
    assert.equal(documents[0].originalName, null);
    assert.equal(documents[0].category, null);
    assert.equal(documents[1].category, 'prueba');
    assert.equal(documents[2].category, 'anexo');
  }
});

test('getDocuments sin paginación conserva el array completo para la búsqueda local', async () => {
  const api = loadApi(async (url) => {
    assert.equal(new URL(url).searchParams.has('page'), false);
    return jsonResponse(200, Array.from({ length: 125 }, (_, index) => ({ id: index + 1 })));
  });
  api.setAuthState('authenticated');
  const documents = await api.getDocuments();
  assert.equal(documents.length, 125);
  assert.equal(documents[124].id, 125);
});

test('getDocuments interpreta el envelope al solicitar page o limit, incluidos cero resultados', async () => {
  for (const pagination of [{ page: 2 }, { limit: 10 }, { page: 1, limit: 20 }]) {
    const api = loadApi(async (url) => {
      const query = new URL(url).searchParams;
      for (const key of ['page', 'limit']) {
        assert.equal(query.get(key), pagination[key] === undefined ? null : String(pagination[key]));
      }
      return jsonResponse(200, { items: [], page: pagination.page ?? 1, limit: pagination.limit ?? 20,
        total: 0, totalPages: 0 });
    });
    api.setAuthState('authenticated');
    const result = await api.getDocuments(pagination);
    assert.equal(result.items.length, 0);
    assert.equal(result.total, 0);
    assert.equal(result.totalPages, 0);
    assert.equal(result.page, pagination.page ?? 1);
    assert.equal(result.limit, pagination.limit ?? 20);
  }
  const api = loadApi(async () => jsonResponse(200, { items: [
    { id: 3, createdAt: '2025-01-01', category: 'demanda' },
    { id: 1, createdAt: '2026-01-01', category: 'escrito' },
  ], page: 2, limit: 2, total: 8, totalPages: 4 }));
  api.setAuthState('authenticated');
  const result = await api.getDocuments({ page: 2, limit: 2, sortBy: 'oldest' });
  assert.equal(JSON.stringify(result.items.map((item) => item.id)), '[3,1]');
  assert.equal(result.items[0].uploadedAt, '2025-01-01T00:00:00.000Z');
  assert.equal(result.total, 8);
  assert.equal(result.totalPages, 4);
});

test('documentos propaga los errores de filtros y servidor sin volver a un listado sin filtros', async () => {
  for (const status of [400, 403, 500]) {
    let calls = 0;
    const api = loadApi(async () => {
      calls += 1;
      return jsonResponse(status, { error: 'No se pudo aplicar el filtro' });
    });
    api.setAuthState('authenticated');
    await assert.rejects(api.getDocuments({ categories: ['demanda'], sortBy: 'newest' }),
      (error) => error.status === status && (status === 500 || /No se pudo aplicar el filtro/.test(error.message)));
    assert.equal(calls, 1);
  }
});

test('al cambiar de cuenta se invalida el resumen personal en caché', async () => {
  let summaries = 0;
  const api = loadApi(async (url) => {
    if (String(url).includes('/dashboard/resumen')) {
      summaries += 1;
      return jsonResponse(200, { usuario: { nombre: 'Usuario' }, metricas: { causasActivas: summaries }, proximasAudiencias: [] });
    }
    return jsonResponse(200, []);
  });
  api.setAuthState('authenticated');
  await api.getDashboardBootstrap();
  await api.getDashboardBootstrap();
  assert.equal(summaries, 1);
  api.resetApiWorkContext();
  const next = await api.getDashboardBootstrap();
  assert.equal(summaries, 2);
  assert.equal(next.resumen.metricas.causasActivas, 2);
});

test('Inicio controla el selector; otras pantallas no muestran selectores redundantes', () => {
  const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
  const dashboard = read('src/screens/DashboardScreen.js');
  const cases = read('src/screens/CasesScreen.js');
  const documents = read('src/screens/DocumentsScreen.js');
  const calendar = read('src/screens/CalendarScreen.js');
  const newCase = read('src/screens/NewCaseScreen.js');
  const navigator = read('src/navigation/DashboardNavigator.js');
  const provider = read('src/context/StudyContext.tsx');
  assert.match(dashboard, /value=\{activeContext\.type\}/);
  assert.match(dashboard, /selectStudyContext/);
  for (const source of [cases, documents, calendar, navigator]) assert.doesNotMatch(source, /<StudyContextSelector|segmentedWrapper>/);
  assert.match(newCase, /¿Dónde deseas guardar esta causa\?/);
  assert.match(provider, /STORAGE_KEY\}\.\$\{userKey\}/);
  assert.match(read('src/components/CaseScopeSelector.tsx'), /duration: reduceMotion\.current \? 0 : 220/);
});

test('el responsable agrega un integrante al ID del estudio y puede mover una causa existente', async () => {
  const calls = [];
  const api = loadApi(async (url, options) => {
    calls.push({ url: String(url), method: options.method, body: options.body ? JSON.parse(options.body) : null });
    if (String(url).includes('/members')) return jsonResponse(200, { data: { legalStudyId: 'study-a', email: 'b@test.test', role: 'MEMBER', status: 'ACTIVE' } });
    return jsonResponse(200, { id: 12, title: 'Causa', scope: 'LEGAL_STUDY', legalStudyId: 'study-a' });
  });
  api.setAuthState('authenticated');
  await api.addLegalStudyMember('study-a', ' B@Test.Test ');
  await api.moveCaseToStudy(12, 'study-a');
  assert.equal(calls[0].url, 'https://api.test/api/v1/legal-studies/study-a/members');
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { email: 'b@test.test' });
  assert.equal(calls[1].url, 'https://api.test/api/v1/causas/12/move-to-study');
  assert.deepEqual(calls[1].body, { legalStudyId: 'study-a' });
});

test('Nueva causa propone el contexto activo y conserva la selección manual de pertenencia', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/NewCaseScreen.js'), 'utf8');
  assert.match(source, /activeContext\.type === 'study' \? 'LEGAL_STUDY' : 'PRIVATE'/);
  assert.match(source, /onPress=\{\(\) => setScope\('PRIVATE'\)\}/);
  assert.match(source, /onPress=\{\(\) => setScope\('LEGAL_STUDY'\)\}/);
  assert.match(source, /legalStudyId: studyId/);
});
