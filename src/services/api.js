import Constants from 'expo-constants';

import { auth } from '../config/firebase';
import mockData from '../data/mockData';
import { normalizeStatusLabel } from '../utils/status';
import { getUserDisplayName, getUserEmail, getUserRole } from '../utils/userDisplay';

export const USE_MOCKS = false;

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  Constants.expoConfig?.extra?.apiBaseUrl ||
  ''
).replace(/\/+$/, '');

let authToken = null;
let mockStore = JSON.parse(JSON.stringify(mockData));
const REQUEST_TIMEOUT_MS = 8000;

function simulateDelay(result, ms = 450) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(result), ms);
  });
}

function runWithTimeout(promise, timeoutMs, timeoutMessage) {
  let timeoutId = null;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(createRequestError(timeoutMessage, 0));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getId(value, fallback = null) {
  return toNumber(value) ?? value ?? fallback;
}

function safeString(value, fallback = '') {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || fallback;
  }

  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value);
}

function safeOptionalString(value) {
  const normalized = safeString(value, '');
  return normalized || null;
}

function getAuthenticatedUserCandidate() {
  const currentUser = auth?.currentUser;

  if (!currentUser) {
    return null;
  }

  return {
    id: currentUser.uid,
    displayName: currentUser.displayName,
    email: currentUser.email,
  };
}

function normalizeDateValue(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getDatePart(isoDate) {
  return isoDate ? isoDate.slice(0, 10) : null;
}

function getTimePart(isoDate) {
  return isoDate ? isoDate.slice(11, 16) : null;
}

function combineDateTime(dateValue, timeValue) {
  if (!dateValue) {
    return null;
  }

  if (timeValue) {
    return normalizeDateValue(`${dateValue}T${timeValue}:00`);
  }

  return normalizeDateValue(dateValue);
}

function sortByDateDesc(items, key) {
  return [...items].sort((first, second) => {
    const firstValue = normalizeDateValue(first[key]);
    const secondValue = normalizeDateValue(second[key]);
    const firstTime = firstValue ? new Date(firstValue).getTime() : 0;
    const secondTime = secondValue ? new Date(secondValue).getTime() : 0;

    return secondTime - firstTime;
  });
}

function sortByDateAsc(items, key) {
  return [...items].sort((first, second) => {
    const firstValue = normalizeDateValue(first[key]);
    const secondValue = normalizeDateValue(second[key]);
    const firstTime = firstValue ? new Date(firstValue).getTime() : Number.MAX_SAFE_INTEGER;
    const secondTime = secondValue ? new Date(secondValue).getTime() : Number.MAX_SAFE_INTEGER;

    return firstTime - secondTime;
  });
}

function getCaseMap() {
  return mockStore.cases.reduce((accumulator, item) => {
    accumulator[item.id] = item;
    return accumulator;
  }, {});
}

function getHearingMap() {
  return mockStore.hearings.reduce((accumulator, item) => {
    accumulator[item.id] = item;
    return accumulator;
  }, {});
}

function getMetrics() {
  const now = new Date();

  return {
    causasActivas: mockStore.cases.filter((item) => {
      const normalizedStatus = normalizeStatusLabel(item?.status, 'Activa');
      return normalizedStatus !== 'Finalizada' && normalizedStatus !== 'Archivada';
    }).length,
    audienciasHoy: mockStore.hearings.filter((item) => new Date(item.date).toDateString() === now.toDateString()).length,
    documentos: mockStore.documents.length,
    tareasPendientes: mockStore.tasks.filter((item) => !item.completed).length,
  };
}

function normalizeUser(user, fallback = {}) {
  const source = user || {};
  const authUser = getAuthenticatedUserCandidate();
  const normalizedName = getUserDisplayName(source, fallback, authUser);
  const normalizedEmail = safeString(getUserEmail(source, fallback, authUser), 'Sin email registrado');
  const normalizedRole = safeString(getUserRole(source, fallback), 'Profesional');

  return {
    ...source,
    id: getId(source.id ?? fallback.id),
    name: normalizedName,
    nombre: normalizedName,
    email: normalizedEmail,
    correo: normalizedEmail,
    role: normalizedRole,
    rol: normalizedRole,
  };
}

function normalizeTask(task) {
  const source = task || {};
  const dueDate = normalizeDateValue(source.dueDate ?? source.fechaVencimiento);

  return {
    ...source,
    id: getId(source.id),
    title: safeString(source.title ?? source.titulo, 'Tarea sin titulo'),
    dueDate,
    fechaVencimiento: dueDate,
    completed: Boolean(source.completed ?? source.completada),
    caseId: getId(source.caseId ?? source.causaId),
  };
}

function normalizeHearing(hearing, context = {}) {
  const source = hearing || {};
  const defaultCase = context.defaultCase || {};
  const caseRef = source.case || source.causa || defaultCase;
  const isoDate = normalizeDateValue(source.date ?? source.fechaHora) || combineDateTime(source.fecha, source.hora);
  const title = safeString(source.title ?? source.titulo, 'Audiencia sin titulo');
  const caseTitle = safeString(
    source.caseTitle ?? source.causaNombre ?? source.causa ?? caseRef?.title ?? caseRef?.titulo,
    'Causa sin referencia'
  );
  const court = safeString(
    source.court ?? source.juzgado ?? caseRef?.court ?? caseRef?.juzgado,
    'Juzgado a confirmar'
  );
  const modality = safeOptionalString(source.modality ?? source.modalidad);
  const location = safeOptionalString(source.location ?? source.ubicacion ?? source.sala);
  const canStart =
    typeof source.canStart === 'boolean'
      ? source.canStart
      : typeof source.puedeIniciar === 'boolean'
        ? source.puedeIniciar
        : Boolean(isoDate && new Date(isoDate).getTime() >= Date.now());
  const status = normalizeStatusLabel(source.status ?? source.estado, 'Programada');

  return {
    ...source,
    id: getId(source.id),
    title,
    titulo: title,
    date: isoDate,
    fecha: getDatePart(isoDate),
    hora: getTimePart(isoDate),
    caseId: getId(source.caseId ?? source.causaId ?? caseRef?.id),
    caseTitle,
    causa: caseTitle,
    court,
    juzgado: court,
    modality,
    modalidad: modality,
    location,
    ubicacion: location,
    canStart,
    puedeIniciar: canStart,
    status,
    estado: status,
  };
}

function normalizeDocument(document, context = {}) {
  const source = document || {};
  const defaultCase = context.defaultCase || {};
  const hearingRef = source.hearing || source.audiencia || {};
  const caseRef = hearingRef.case || hearingRef.causa || source.case || source.causa || defaultCase;
  const fileName = safeString(source.fileName ?? source.nombreArchivo ?? source.name, 'documento');
  const uploadedAt = normalizeDateValue(source.uploadedAt ?? source.createdAt ?? source.fechaCarga);
  const documentType = safeString(source.documentType ?? source.tipo ?? context.documentType, 'Documento');
  const hearingTitle = safeString(source.hearingTitle ?? hearingRef.title ?? hearingRef.titulo, 'Audiencia sin referencia');
  const caseTitle = safeString(
    source.caseTitle ?? caseRef?.title ?? caseRef?.titulo,
    'Causa sin referencia'
  );

  return {
    ...source,
    id: getId(source.id),
    hearingId: getId(source.hearingId ?? source.audienciaId ?? hearingRef.id),
    caseId: getId(source.caseId ?? source.causaId ?? caseRef?.id),
    fileName,
    nombre: fileName,
    archivo: fileName,
    nombreArchivo: fileName,
    documentType,
    tipo: documentType,
    uploadedAt,
    createdAt: uploadedAt,
    fecha: uploadedAt,
    path: safeString(source.path ?? source.ruta, `/uploads/${fileName}`),
    hearingTitle,
    audiencia: hearingTitle,
    caseTitle,
    causa: caseTitle,
  };
}

function normalizeCase(caseItem) {
  const source = caseItem || {};
  const title = safeString(source.title ?? source.titulo, 'Causa sin titulo');
  const description = safeString(source.description ?? source.descripcion, 'Sin informacion adicional registrada.');
  const status = normalizeStatusLabel(source.status ?? source.estado, 'Activa');
  const court = safeString(source.court ?? source.juzgado ?? source.tribunal, 'Juzgado a confirmar');
  const createdAt = normalizeDateValue(source.createdAt ?? source.fechaCreacion ?? source.fechaAlta ?? source.fecha);
  const defaultCase = { id: source.id, title, court };
  const rawHearings = toArray(source.hearings ?? source.audiencias);
  const hearings = rawHearings.map((item) => normalizeHearing(item, { defaultCase }));
  const nestedDocuments = rawHearings.flatMap((hearing) =>
    toArray(hearing.files ?? hearing.documents ?? hearing.documentos ?? hearing.archivos).map((item) =>
      normalizeDocument(
        {
          ...item,
          hearingId: item.hearingId ?? hearing.id,
          hearingTitle: item.hearingTitle ?? hearing.title ?? hearing.titulo,
          caseId: item.caseId ?? source.id,
          caseTitle: item.caseTitle ?? title,
        },
        { defaultCase }
      )
    )
  );
  const rawDocuments = toArray(source.documents ?? source.documentos ?? source.files ?? source.archivos);
  const documents = (rawDocuments.length ? rawDocuments : nestedDocuments).map((item) => normalizeDocument(item, { defaultCase }));
  const tasks = toArray(source.tasks ?? source.tareas).map(normalizeTask);

  return {
    ...source,
    id: getId(source.id),
    title,
    titulo: title,
    description,
    descripcion: description,
    status,
    estado: status,
    court,
    juzgado: court,
    createdAt,
    fecha: createdAt,
    hearings,
    audiencias: hearings,
    documents,
    documentos: documents,
    tasks,
    tareas: tasks,
  };
}

function normalizeDashboardResumen(data) {
  const source = data || {};
  const metricas = source.metricas || source.metrics || {};
  const upcoming = toArray(source.proximasAudiencias ?? source.upcomingHearings).map((item) => normalizeHearing(item));

  return {
    usuario: normalizeUser(source.usuario ?? source.user),
    metricas: {
      causasActivas: toNumber(metricas.causasActivas ?? metricas.activeCases) ?? 0,
      audienciasHoy: toNumber(metricas.audienciasHoy ?? metricas.hearingsToday) ?? 0,
      documentos: toNumber(metricas.documentos ?? metricas.documents) ?? 0,
      tareasPendientes: toNumber(metricas.tareasPendientes ?? metricas.pendingTasks) ?? 0,
    },
    proximasAudiencias: sortByDateAsc(upcoming, 'date'),
  };
}

function normalizeNotification(notification) {
  const source = notification || {};
  const createdAt = normalizeDateValue(source.createdAt ?? source.fecha ?? source.date);

  return {
    ...source,
    id: getId(source.id),
    title: safeString(source.title ?? source.titulo, 'Notificacion'),
    message: safeString(source.message ?? source.mensaje, ''),
    read: Boolean(source.read ?? source.leida),
    createdAt,
  };
}

function mapUpcomingHearings(limit = 5) {
  const caseMap = getCaseMap();

  return mockStore.hearings
    .filter((item) => new Date(item.date).getTime() >= Date.now())
    .sort((first, second) => new Date(first.date) - new Date(second.date))
    .slice(0, limit)
    .map((item) =>
      normalizeHearing({
        ...item,
        caseTitle: caseMap[item.caseId]?.title || 'Causa sin referencia',
        court: caseMap[item.caseId]?.court || 'Juzgado a confirmar',
        canStart: true,
      })
    );
}

function getCaseDetailMock(id) {
  const caseItem = mockStore.cases.find((item) => item.id === Number(id));

  if (!caseItem) {
    throw new Error('No encontramos la causa solicitada.');
  }

  const caseHearings = mockStore.hearings
    .filter((item) => item.caseId === caseItem.id)
    .sort((first, second) => new Date(first.date) - new Date(second.date));

  return normalizeCase({
    ...caseItem,
    hearings: caseHearings,
    documents: mockStore.documents.filter((item) => item.caseId === caseItem.id),
    tasks: mockStore.tasks.filter((item) => item.caseId === caseItem.id),
  });
}

function createRequestError(message, status = 0, data = null) {
  const error = new Error(message);
  error.status = status;
  error.data = data;
  return error;
}

function getErrorMessage(status, data) {
  if (typeof data === 'string' && data.trim()) {
    return data;
  }

  if (data?.message) {
    return data.message;
  }

  if (status === 401 || status === 403) {
    return 'La sesion actual no tiene permisos para completar esta accion. Volve a ingresar e intentalo nuevamente.';
  }

  if (status >= 500) {
    return 'No pudimos procesar la solicitud en este momento. Intenta nuevamente en unos minutos.';
  }

  return 'No pudimos completar la solicitud. Intenta nuevamente.';
}

export async function request(endpoint, options = {}) {
  if (!API_BASE_URL) {
    throw new Error('Defini EXPO_PUBLIC_API_BASE_URL para usar la API real.');
  }

  const path = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
  const hasJsonBody =
    options.body !== undefined &&
    options.body !== null &&
    !(options.body instanceof FormData) &&
    typeof options.body !== 'string';
  const body = hasJsonBody ? JSON.stringify(options.body) : options.body;

  let response;

  try {
    response = await runWithTimeout(
      fetch(API_BASE_URL + path, {
        ...options,
        body,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined && body !== null && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
          ...getAuthHeaders(),
          ...options.headers,
        },
      }),
      REQUEST_TIMEOUT_MS,
      'La solicitud a ' + path + ' supero el maximo de ' + REQUEST_TIMEOUT_MS + ' ms.'
    );
  } catch (error) {
    throw createRequestError(
      error?.message || 'No pudimos conectar con el servidor. Verifica tu conexion e intenta nuevamente.',
      0,
      error
    );
  }

  if (response.status === 204) {
    return null;
  }

  const rawText = await response.text();
  let data = null;

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = rawText;
    }
  }

  if (!response.ok) {
    throw createRequestError(getErrorMessage(response.status, data), response.status, data);
  }

  return data;
}

export function setAuthToken(token) {
  authToken = token;
}

export function getAuthHeaders() {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

export async function getMe() {
  if (USE_MOCKS) {
    return simulateDelay(normalizeUser(mockStore.user, getAuthenticatedUserCandidate() || {}));
  }

  try {
    const data = await request('/auth/me');
    return normalizeUser(data);
  } catch (error) {
    const resumen = await getDashboardResumen().catch(() => null);

    if (resumen?.usuario) {
      return normalizeUser(resumen.usuario);
    }

    throw error;
  }
}

export async function getDashboardResumen() {
  if (USE_MOCKS) {
    return simulateDelay({
      usuario: normalizeUser(mockStore.user, getAuthenticatedUserCandidate() || {}),
      metricas: getMetrics(),
      proximasAudiencias: mapUpcomingHearings(),
    });
  }

  const data = await request('/dashboard/resumen');
  return normalizeDashboardResumen(data);
}

export async function getCases() {
  if (USE_MOCKS) {
    const cases = sortByDateDesc(mockStore.cases, 'createdAt').map((item) => normalizeCase(item));
    return simulateDelay(cases);
  }

  const data = await request('/causas');
  return sortByDateDesc(toArray(data).map((item) => normalizeCase(item)), 'createdAt');
}

export async function getCaseById(id) {
  if (USE_MOCKS) {
    return simulateDelay(getCaseDetailMock(id));
  }

  const data = await request(`/causas/${id}`);
  const normalizedCase = normalizeCase(data);
  const hasHearings = Array.isArray(data?.hearings) || Array.isArray(data?.audiencias);
  const hasDocuments =
    Array.isArray(data?.documents) ||
    Array.isArray(data?.documentos) ||
    Array.isArray(data?.files) ||
    Array.isArray(data?.archivos) ||
    toArray(data?.hearings ?? data?.audiencias).some(
      (item) =>
        Array.isArray(item?.files) ||
        Array.isArray(item?.documents) ||
        Array.isArray(item?.documentos) ||
        Array.isArray(item?.archivos)
    );

  if (hasHearings && hasDocuments) {
    return normalizedCase;
  }

  const [hearings, documents] = await Promise.all([
    hasHearings ? Promise.resolve(normalizedCase.hearings) : getHearings().catch(() => []),
    hasDocuments ? Promise.resolve(normalizedCase.documents) : getDocuments().catch(() => []),
  ]);

  const caseHearings = hasHearings ? normalizedCase.hearings : hearings.filter((item) => item.caseId === normalizedCase.id);
  const caseDocuments = hasDocuments ? normalizedCase.documents : documents.filter((item) => item.caseId === normalizedCase.id);

  return {
    ...normalizedCase,
    hearings: caseHearings,
    audiencias: caseHearings,
    documents: caseDocuments,
    documentos: caseDocuments,
    tasks: normalizedCase.tasks || [],
    tareas: normalizedCase.tasks || [],
  };
}

function normalizeCasePayload(data = {}) {
  const title = safeString(data.title ?? data.titulo, '').trim();
  const description = safeString(data.description ?? data.descripcion, '').trim();
  const court = safeString(data.court ?? data.juzgado, '').trim();
  const status = safeString(data.status ?? data.estado, 'Activa').trim();

  return {
    title,
    titulo: title,
    description,
    descripcion: description,
    court,
    juzgado: court,
    status,
    estado: status,
  };
}

export async function createCase(data) {
  if (USE_MOCKS) {
    const nextId = Math.max(0, ...mockStore.cases.map((item) => item.id)) + 1;
    const newCase = normalizeCase({
      id: nextId,
      title: data.title ?? data.titulo,
      description: data.description ?? data.descripcion,
      court: data.court ?? data.juzgado,
      status: data.status ?? data.estado,
      createdAt: new Date().toISOString(),
    });

    mockStore.cases = [newCase, ...mockStore.cases];
    return simulateDelay(newCase);
  }

  const payload = normalizeCasePayload(data);
  const response = await request('/causas', { method: 'POST', body: payload });
  return normalizeCase({
    ...response,
    title: response?.title ?? payload.title,
    description: response?.description ?? payload.description,
    court: response?.court ?? payload.court,
    status: response?.status ?? payload.status,
  });
}

export async function updateCase(id, data) {
  if (USE_MOCKS) {
    const caseIndex = mockStore.cases.findIndex((item) => item.id === Number(id));

    if (caseIndex === -1) {
      throw new Error('No encontramos la causa solicitada.');
    }

    const currentCase = mockStore.cases[caseIndex];
    const updatedCase = normalizeCase({
      ...currentCase,
      title: data.title ?? data.titulo ?? currentCase.title,
      description: data.description ?? data.descripcion ?? currentCase.description,
      court: data.court ?? data.juzgado ?? currentCase.court,
      status: data.status ?? data.estado ?? currentCase.status,
    });

    mockStore.cases = mockStore.cases.map((item) => (item.id === Number(id) ? updatedCase : item));
    return simulateDelay(updatedCase);
  }

  const payload = normalizeCasePayload(data);
  const response = await request(`/causas/${id}`, { method: 'PUT', body: payload });
  return normalizeCase({
    ...response,
    id,
    title: response?.title ?? payload.title,
    description: response?.description ?? payload.description,
    court: response?.court ?? payload.court,
    status: response?.status ?? payload.status,
  });
}

export async function getHearings() {
  if (USE_MOCKS) {
    const caseMap = getCaseMap();
    const items = sortByDateAsc(mockStore.hearings, 'date').map((item) =>
      normalizeHearing({
        ...item,
        caseTitle: caseMap[item.caseId]?.title || 'Causa sin referencia',
        court: caseMap[item.caseId]?.court || 'Juzgado a confirmar',
      })
    );

    return simulateDelay(items);
  }

  const data = await request('/audiencias');
  return sortByDateAsc(toArray(data).map((item) => normalizeHearing(item)), 'date');
}

export async function getUpcomingHearings() {
  if (USE_MOCKS) {
    return simulateDelay(mapUpcomingHearings());
  }

  const data = await request('/audiencias/proximas');
  return sortByDateAsc(toArray(data).map((item) => normalizeHearing(item)), 'date');
}

function normalizeHearingPayload(data = {}) {
  const title = safeString(data.title ?? data.titulo, '').trim();
  const normalizedDate = combineDateTime(data.date ?? data.fecha, data.time ?? data.hora);
  const caseId = toNumber(data.caseId ?? data.causaId);
  const modality = safeString(data.modality ?? data.modalidad, '').trim();
  const location = safeString(data.location ?? data.ubicacion, '').trim();

  return {
    title,
    titulo: title,
    date: normalizedDate,
    fechaHora: normalizedDate,
    fecha: safeString(data.date ?? data.fecha, '').trim(),
    hora: safeString(data.time ?? data.hora, '').trim(),
    caseId,
    causaId: caseId,
    modality,
    modalidad: modality,
    location,
    ubicacion: location,
  };
}

export async function createHearing(data) {
  if (USE_MOCKS) {
    const nextId = Math.max(0, ...mockStore.hearings.map((item) => item.id)) + 1;
    const newHearing = normalizeHearing({
      id: nextId,
      title: data.title ?? data.titulo,
      caseId: data.caseId ?? data.causaId,
      date: combineDateTime(data.date ?? data.fecha, data.time ?? data.hora),
      modality: data.modality ?? data.modalidad,
      location: data.location ?? data.ubicacion,
      status: 'Programada',
    });

    mockStore.hearings = [...mockStore.hearings, newHearing];
    return simulateDelay(newHearing);
  }

  const payload = normalizeHearingPayload(data);
  const response = await request('/audiencias', { method: 'POST', body: payload });

  return normalizeHearing({
    ...response,
    title: response?.title ?? payload.title,
    date: response?.date ?? payload.date,
    caseId: response?.caseId ?? payload.caseId,
    modality: response?.modality ?? payload.modality,
    location: response?.location ?? payload.location,
  });
}

export async function getDocuments() {
  if (USE_MOCKS) {
    const caseMap = getCaseMap();
    const hearingMap = getHearingMap();
    const items = sortByDateDesc(mockStore.documents, 'uploadedAt').map((item) =>
      normalizeDocument({
        ...item,
        caseTitle: caseMap[item.caseId]?.title || 'Causa sin referencia',
        hearingTitle: hearingMap[item.hearingId]?.title || 'Audiencia sin referencia',
      })
    );

    return simulateDelay(items);
  }

  const data = await request('/documentos');
  return sortByDateDesc(toArray(data).map((item) => normalizeDocument(item)), 'uploadedAt');
}

function normalizeDocumentPayload(data = {}) {
  const fileName = safeString(data.fileName ?? data.nombreArchivo, '').trim();
  const hearingId = toNumber(data.hearingId ?? data.audienciaId);
  const documentType = safeString(data.documentType ?? data.tipo, '').trim();
  const path = safeString(data.path ?? data.ruta, '/uploads/' + (fileName || 'documento-simulado.pdf'));

  return {
    fileName,
    nombreArchivo: fileName,
    path,
    ruta: path,
    hearingId,
    audienciaId: hearingId,
    documentType,
    tipo: documentType,
  };
}

export async function uploadDocument(data) {
  if (USE_MOCKS) {
    const nextId = Math.max(0, ...mockStore.documents.map((item) => item.id)) + 1;
    const hearing = mockStore.hearings.find((item) => item.id === Number(data.hearingId));
    const newDocument = normalizeDocument({
      id: nextId,
      hearingId: data.hearingId,
      caseId: hearing?.caseId || null,
      fileName: data.fileName ?? data.nombreArchivo,
      documentType: data.documentType ?? data.tipo,
      uploadedAt: new Date().toISOString(),
      path: data.path ?? `/uploads/${safeString(data.fileName ?? data.nombreArchivo, 'documento-simulado.pdf')}`,
    });

    mockStore.documents = [newDocument, ...mockStore.documents];
    return simulateDelay(newDocument);
  }

  const payload = normalizeDocumentPayload(data);
  const response = await request('/documentos', { method: 'POST', body: payload });

  return normalizeDocument({
    ...response,
    fileName: response?.fileName ?? payload.fileName,
    path: response?.path ?? payload.path,
    hearingId: response?.hearingId ?? payload.hearingId,
    documentType: response?.documentType ?? payload.documentType,
  });
}

export async function getNotifications() {
  if (USE_MOCKS) {
    return simulateDelay([...mockStore.notifications]);
  }

  try {
    const data = await request('/notificaciones');
    return sortByDateDesc(toArray(data).map((item) => normalizeNotification(item)), 'createdAt');
  } catch {
    return [];
  }
}

export async function getDashboardBootstrap() {
  const [resumen, notifications] = await Promise.all([getDashboardResumen(), getNotifications().catch(() => [])]);

  return {
    resumen,
    notificationCount: notifications.filter((item) => !item.read).length,
  };
}

export function preloadDashboardBootstrap() {
  return getDashboardBootstrap().catch(() => null);
}
