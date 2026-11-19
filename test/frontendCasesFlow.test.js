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
    if (request === '../utils/apiError') {
      return { normalizeApiErrorPayload: (data, error) => ({
        code: data?.errorCode ?? data?.code ?? data?.error?.code ?? error?.code ?? null,
        message: typeof data === 'string' ? data : typeof data?.error === 'string' ? data.error : data?.error?.message ?? data?.message ?? error?.message ?? null,
      }) };
    }
    if (request === '../utils/studyInvitationStatus') {
      return { requirePendingStudyInvitation: (invitation) => {
        if (!invitation || invitation.status !== 'PENDING') throw Object.assign(new Error('Estado de invitación inválido.'), { code: 'INVITATION_STATE_UNAVAILABLE' });
        return invitation;
      } };
    }
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

test('deleteCase llama a la baja lógica autenticada del estudio', async () => {
  let request;
  const api = loadApi(async (url, options) => {
    request = { url, options };
    return jsonResponse(204, {});
  });
  api.setAuthState('authenticated');
  assert.equal(await api.deleteCase(42), true);
  assert.equal(request.url, 'https://api.test/api/v1/causas/42');
  assert.equal(request.options.method, 'DELETE');
  assert.equal(request.options.headers.Authorization, 'Bearer test-token');
});

test('the screens follow server capabilities for self-protection and case actions', () => {
  const adminSource = fs.readFileSync(path.join(root, 'src/screens/StudyAdministrationScreen.js'), 'utf8');
  const casesSource = fs.readFileSync(path.join(root, 'src/screens/CasesScreen.js'), 'utf8');
  const detailSource = fs.readFileSync(path.join(root, 'src/screens/CaseDetailScreen.js'), 'utf8');

  assert.match(adminSource, /member\.isCurrentUser === true/);
  assert.match(adminSource, /member\.status === 'ACTIVE' && member\.isCurrentUser !== true/);
  assert.match(adminSource, /Tu cuenta/);
  assert.match(casesSource, /activeLegalStudy\?\.capabilities\?\.canCreateStudyCase === true/);
  assert.match(casesSource, /actionLabel=\{canCreateCase \? 'Nueva causa' : undefined\}/);
  assert.match(detailSource, /caseDetail\?\.canEditCase === true/);
  assert.match(detailSource, /caseDetail\?\.canDeleteCase === true/);
  assert.match(detailSource, /Eliminar causa/);
});

test('deleteDocument conserva los errores de permiso y procesamiento del backend', async () => {
  for (const [status, error] of [[404, 'Recurso no encontrado'], [409, 'El documento está siendo procesado']]) {
    const api = loadApi(async () => jsonResponse(status, { error }));
    api.setAuthState('authenticated');
    await assert.rejects(api.deleteDocument(9), (failure) => failure.status === status && failure.message === error);
  }
});

test('createLegalStudy usa la ruta vigente y conserva el ID y nombre devueltos por el backend', async () => {
  for (const payload of [
    { success: true, data: { id: 'study-uuid', name: 'Estudio Sur' } },
    { id: 'study-uuid', name: 'Estudio Sur' },
  ]) {
    const api = loadApi(async (url, options) => {
      assert.equal(url, 'https://api.test/api/v1/legal-studies');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      assert.deepEqual(JSON.parse(options.body), { name: 'Estudio   Sur' });
      return jsonResponse(201, payload);
    });
    api.setAuthState('authenticated');
    const study = await api.createLegalStudy('  Estudio   Sur  ');
    assert.equal(study.id, 'study-uuid');
    assert.equal(study.name, 'Estudio Sur');
  }
});

test('createLegalStudy rechaza respuestas incompletas sin inventar identificadores', async () => {
  const api = loadApi(async () => jsonResponse(201, { success: true, data: {} }));
  api.setAuthState('authenticated');
  await assert.rejects(api.createLegalStudy('Sur'), /No se pudo crear el estudio/);
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

test('dashboard prioriza el instante ISO y conserva el contrato anterior de audiencia', async () => {
  const api = loadApi(async () => jsonResponse(200, {
    usuario: { nombre: 'Usuario' },
    metricas: {},
    proximasAudiencias: [
      {
        id: 1,
        date: '2026-11-30T23:30:00-03:00',
        fecha: '2026-12-01',
        hora: '02:30',
        titulo: 'Audiencia de madrugada',
      },
      { id: 2, fecha: '2026-12-01', hora: '12:00', titulo: 'Contrato anterior' },
    ],
  }));
  api.setAuthState('authenticated');

  const { proximasAudiencias } = await api.getDashboardResumen();
  const [nearMidnight, legacy] = proximasAudiencias;

  assert.equal(nearMidnight.date, '2026-12-01T02:30:00.000Z');
  assert.equal(nearMidnight.fecha, '2026-12-01');
  assert.equal(nearMidnight.hora, '02:30');
  assert.equal(new Intl.DateTimeFormat('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(nearMidnight.date)), '30/11/2026');
  assert.equal(new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(nearMidnight.date)), '23:30');
  assert.equal(legacy.date, new Date('2026-12-01T12:00:00').toISOString());
  assert.equal(legacy.titulo, 'Contrato anterior');
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

  calls.length = 0;
  api.setApiWorkContext({ type: 'study', legalStudyId: 'study-b', name: 'Estudio B' });
  await api.getDashboardResumen();
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('scope=study') && calls[0].includes('legalStudyId=study-b'));
});

test('las respuestas tardías de dos estudios no reemplazan el último contexto seleccionado', async () => {
  const pending = new Map();
  const calls = [];
  const api = loadApi((url) => {
    if (String(url).includes('/notificaciones/centro')) {
      return Promise.resolve(jsonResponse(200, { pendingTasks: [], notifications: [] }));
    }
    return new Promise((resolve) => {
    const query = new URL(url).searchParams;
    const key = query.get('scope') === 'study' ? query.get('legalStudyId') : 'personal';
    calls.push(String(url));
    pending.set(key, resolve);
    });
  });
  api.setAuthState('authenticated');

  const personalPromise = api.getDashboardBootstrap();
  api.setApiWorkContext({ type: 'study', legalStudyId: 'study-a' });
  const firstStudyPromise = api.getDashboardBootstrap();
  api.setApiWorkContext({ type: 'study', legalStudyId: 'study-b' });
  const lastStudyPromise = api.getDashboardBootstrap();
  await new Promise((resolve) => setTimeout(resolve, 0));

  pending.get('study-b')(jsonResponse(200, { usuario: { nombre: 'Usuario' }, metricas: { tareasPendientes: 7 }, proximasAudiencias: [] }));
  const lastStudy = await lastStudyPromise;
  pending.get('study-a')(jsonResponse(200, { usuario: { nombre: 'Usuario' }, metricas: { tareasPendientes: 2 }, proximasAudiencias: [] }));
  await firstStudyPromise;
  pending.get('personal')(jsonResponse(200, { usuario: { nombre: 'Usuario' }, metricas: { tareasPendientes: 1 }, proximasAudiencias: [] }));
  await personalPromise;

  const cached = await api.getDashboardBootstrap();
  assert.equal(lastStudy.resumen.metricas.tareasPendientes, 7);
  assert.equal(cached.resumen.metricas.tareasPendientes, 7);
  assert.equal(calls.length, 3);
  assert.ok(calls.some((url) => url.includes('scope=personal')));
  assert.ok(calls.some((url) => url.includes('scope=study') && url.includes('legalStudyId=study-a')));
  assert.ok(calls.some((url) => url.includes('scope=study') && url.includes('legalStudyId=study-b')));
});

test('crear y completar tareas invalida el resumen del dashboard', async () => {
  let summaries = 0;
  let mutations = 0;
  const api = loadApi(async (url, options = {}) => {
    if (String(url).includes('/dashboard/resumen')) {
      summaries += 1;
      return jsonResponse(200, { usuario: { nombre: 'Usuario' }, metricas: { tareasPendientes: summaries }, proximasAudiencias: [] });
    }
    if (String(url).includes('/tareas')) {
      mutations += 1;
      return jsonResponse(200, { id: mutations, status: 'Pendiente' });
    }
    if (String(url).includes('/audiencias')) return jsonResponse(200, { id: 4, completedAt: '2026-11-19T12:00:00.000Z' });
    return jsonResponse(200, []);
  });
  api.setAuthState('authenticated');

  await api.getDashboardBootstrap();
  await api.getDashboardBootstrap();
  assert.equal(summaries, 1);

  await api.createCalendarTask({ title: 'Tarea de prueba', legalStudyId: 'study-a' });
  await api.getDashboardBootstrap();
  assert.equal(summaries, 2);

  await api.setTaskCompleted(1, true);
  await api.getDashboardBootstrap();
  assert.equal(summaries, 3);

  await api.setHearingCompleted(4, true);
  await api.getDashboardBootstrap();
  assert.equal(summaries, 4);
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

test('el centro solicita notificaciones en el contexto activo y alimenta el contador de Inicio', async () => {
  const calls = [];
  const api = loadApi(async (url, options) => {
    calls.push({ url: String(url), authorization: options.headers.Authorization });
    if (String(url).includes('/dashboard/resumen')) {
      return jsonResponse(200, { usuario: { nombre: 'Usuario' }, metricas: {}, proximasAudiencias: [] });
    }
    return jsonResponse(200, {
      pendingTasks: [],
      notifications: [{ id: 'hearing-reminder:4' }, { id: 'hearing-reminder:5' }],
    });
  });
  api.setAuthState('authenticated');
  api.setApiWorkContext({ type: 'study', legalStudyId: 'study-a' });

  const bootstrap = await api.getDashboardBootstrap();
  const center = await api.getNotificationCenter({ context: { type: 'study', legalStudyId: 'study-a' } });

  assert.equal(bootstrap.notificationCount, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(center)), {
    pendingTasks: [],
    notifications: [{ id: 'hearing-reminder:4' }, { id: 'hearing-reminder:5' }],
  });
  assert.equal(calls.filter(({ url }) => url.includes('/notificaciones/centro')).length, 2);
  assert.ok(calls.every(({ url }) => url.includes('scope=study&legalStudyId=study-a')));
  assert.ok(calls.every(({ authorization }) => authorization === 'Bearer test-token'));
});

test('la campana abre Notificaciones y el avatar mantiene el acceso a Más', () => {
  const dashboard = fs.readFileSync(path.join(root, 'src/screens/DashboardScreen.js'), 'utf8');
  const navigator = fs.readFileSync(path.join(root, 'src/navigation/DashboardNavigator.js'), 'utf8');
  const header = fs.readFileSync(path.join(root, 'src/components/WebHeader.js'), 'utf8');
  assert.match(dashboard, /const handleNotificationsPress = useCallback\(\(\) => \{\s*navigation\.navigate\('Notificaciones'\)/);
  assert.match(dashboard, /const handleProfilePress = useCallback\(\(\) => \{\s*navigation\.navigate\('Mas'\)/);
  assert.match(dashboard, /onPress=\{handleNotificationsPress\}[\s\S]*?name="bell-outline"/);
  assert.match(dashboard, /accessibilityLabel="Ver mi perfil"[\s\S]*?onPress=\{handleProfilePress\}/);
  assert.match(navigator, /<Stack\.Screen component=\{NotificationCenterScreen\} name="Notificaciones"/);
  assert.match(header, /Notificaciones: 'Notificaciones'/);
});

test('el centro vuelve a cargar al enfocarse y el calendario consume cada salto una sola vez', () => {
  const center = fs.readFileSync(path.join(root, 'src/screens/NotificationCenterScreen.js'), 'utf8');
  const calendar = fs.readFileSync(path.join(root, 'src/screens/CalendarScreen.js'), 'utf8');
  assert.match(center, /useFocusEffect\([\s\S]*?void loadCenter\(\)/);
  assert.match(center, /force: true,[\s\S]*?context: activeContext/);
  assert.match(center, /loadSequenceRef\.current !== requestId/);
  assert.match(center, /centerContextKey === requestContextKey/);
  assert.match(center, /hasCurrentContextData \? center : \{ pendingTasks: \[\], notifications: \[\] \}/);
  assert.match(center, /notificationIntentId: intentId/);
  assert.match(calendar, /consumedCalendarIntentRef\.current === intentId/);
  assert.match(calendar, /navigation\.setParams\(\{ selectedDate: undefined, selectedTaskId: undefined, notificationIntentId: undefined \}\)/);
  assert.match(calendar, /setFilters\(DEFAULT_FILTERS\)/);
  assert.match(calendar, /String\(event\.sourceId\) === String\(notificationTaskId\)/);
});

test('el calendario prioriza la fecha agendada y usa el vencimiento como respaldo', () => {
  const filename = path.join(root, 'src/utils/calendar.js');
  const transformed = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const module = { exports: {} };
  vm.runInNewContext(transformed, {
    Date,
    Intl,
    JSON,
    Map,
    Math,
    Number,
    Object,
    String,
    module,
    exports: module.exports,
    require: (request) => {
      if (request === '../constants/caseCourtTypes.js') return { getCaseCourtType: () => '' };
      throw new Error(`Modulo no esperado: ${request}`);
    },
  });

  const { buildCalendarEvents, getTaskCalendarDate } = module.exports;
  const scheduled = '2026-12-02T14:30:00.000Z';
  const due = '2026-12-05T23:00:00.000Z';
  assert.equal(getTaskCalendarDate({ scheduledAt: scheduled, dueDate: due }), scheduled);
  assert.equal(getTaskCalendarDate({ scheduledAt: null, dueDate: due }), due);
  assert.equal(getTaskCalendarDate({}), null);
  const [event] = buildCalendarEvents({ tasks: [{ id: 10, title: 'Presentar escrito', scheduledAt: scheduled, dueDate: due }] });
  assert.equal(event.date, scheduled);
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

test('la navegación web marca el inicio y asocia pantallas secundarias con su sección', () => {
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  const sidebar = fs.readFileSync(path.join(root, 'src/components/WebSidebar.js'), 'utf8');
  const detail = fs.readFileSync(path.join(root, 'src/screens/CaseDetailScreen.js'), 'utf8');
  const colors = fs.readFileSync(path.join(root, 'src/constants/colors.js'), 'utf8');

  assert.match(app, /onReady=\{\(\) => setNavigationState\(navigationRef\.getRootState\(\)\)\}/);
  assert.match(app, /current = focusedRoute\.state \|\| focusedRoute/);
  assert.match(sidebar, /\['InvitacionesEstudio', 'LuxMemory'\]\.includes\(activeRoute\)/);
  assert.match(sidebar, /borderColor: colors\.gold/);
  assert.match(detail, /accessibilityState=\{\{ expanded \}\}/);
  assert.match(detail, /Ocultar audiencias recientes/);
  assert.match(detail, /Audiencias vencidas sin finalizar/);
  assert.match(detail, /completedAt \? 'Finalizada'/);
  assert.match(detail, /completedHearingBackground/);
  assert.match(colors, /completedHearingBackground: '#4A151B'/);
  assert.match(colors, /completedHearingText: '#FF8A91'/);
});

test('el administrador envía una invitación al estudio y puede mover una causa existente', async () => {
  const calls = [];
  const api = loadApi(async (url, options) => {
    calls.push({ url: String(url), method: options.method, body: options.body ? JSON.parse(options.body) : null });
    if (String(url).includes('/invitations')) return jsonResponse(201, { data: { id: 'invite-a', studyId: 'study-a', email: 'b@test.test', role: 'LAWYER', status: 'PENDING' } });
    return jsonResponse(200, { id: 12, title: 'Causa', scope: 'LEGAL_STUDY', legalStudyId: 'study-a' });
  });
  api.setAuthState('authenticated');
  await api.createStudyInvitation('study-a', ' B@Test.Test ', 'LAWYER');
  await api.moveCaseToStudy(12, 'study-a');
  assert.equal(calls[0].url, 'https://api.test/api/v1/legal-studies/study-a/invitations');
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { email: 'b@test.test', role: 'LAWYER' });
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
