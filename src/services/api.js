import { API_BASE_URL as CONFIG_API_BASE_URL, API_ROOT_URL } from '../config/api';
import { auth } from '../config/firebase';
import mockData from '../data/mockData';
import { normalizeStatusLabel } from '../utils/status';
import { getUserDisplayName, getUserEmail, getUserRole } from '../utils/userDisplay';

export const USE_MOCKS = false;

const DASHBOARD_RESUMEN_ENDPOINT = '/dashboard/resumen';

export const API_BASE_URL = CONFIG_API_BASE_URL;

export const FILE_BASE_URL = API_ROOT_URL;

let authToken = null;
let mockStore = JSON.parse(JSON.stringify(mockData));
const REQUEST_TIMEOUT_MS = 8000;
const LUX_REQUEST_TIMEOUT_MS = 120000;
const EXPIRED_SESSION_MESSAGE = 'Tu sesión expiró. Iniciá sesión nuevamente.';
const MISSING_SESSION_MESSAGE = 'No hay una sesión activa. Iniciá sesión nuevamente.';
const PROTECTED_ENDPOINT_PREFIXES = ['/dashboard/resumen', '/causas', '/audiencias', '/documentos', '/lux/chat', '/transcriptions'];
const LUX_CONNECTION_ERROR_MESSAGE = 'No pude conectarme con LUX en este momento.';
const LUX_TIMEOUT_ERROR_MESSAGE = 'LUX tardó demasiado en responder. Intentá de nuevo con una consulta más corta.';

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

function firstTextValue(...values) {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();

      if (trimmed) {
        return trimmed;
      }

      continue;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
  }

  return null;
}

function firstObjectValue(...values) {
  return values.find((value) => value && typeof value === 'object' && !Array.isArray(value)) || {};
}

function normalizeLookupKey(value) {
  return safeString(value, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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
  const caseRef = firstObjectValue(source.case, source.causa, source.caseData, defaultCase);
  const isoDate = normalizeDateValue(source.date ?? source.fechaHora) || combineDateTime(source.fecha, source.hora);
  const time = getTimePart(isoDate);
  const title = firstTextValue(source.title, source.titulo) || 'Audiencia sin titulo';
  const caseTitle = firstTextValue(
    source.caseTitle,
    source.case_title,
    source.causaNombre,
    source.caseName,
    source.case?.title,
    source.case?.titulo,
    source.causa?.title,
    source.causa?.titulo,
    source.caseData?.title,
    source.caseData?.titulo,
    source.causa
  ) || 'Causa sin referencia';
  const court = firstTextValue(
    source.court,
    source.courtName,
    source.caseCourt,
    source.case_court,
    source.juzgado,
    source.case?.court,
    source.case?.courtName,
    source.case?.juzgado,
    source.causa?.court,
    source.causa?.juzgado,
    source.caseData?.court,
    source.caseData?.juzgado
  );
  const modality = firstTextValue(
    source.modality,
    source.modalidad,
    source.mode,
    source.format,
    source.tipoModalidad,
    source.hearingMode,
    source.case?.modality,
    source.causa?.modalidad
  );
  const location = firstTextValue(source.location, source.ubicacion, source.sala);
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
    time,
    hora: time,
    caseId: getId(source.caseId ?? source.causaId ?? source.case_id ?? source.causa_id ?? caseRef?.id),
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
    raw: source,
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
  const title = safeString(source.title ?? source.titulo ?? source.caratula, 'Causa sin titulo');
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

function shouldEnrichHearingCourt(hearing) {
  return (
    !hearing?.court &&
    (Boolean(hearing?.caseId) || hearing?.caseTitle !== 'Causa sin referencia')
  );
}

function getRelatedCaseFromHearing(hearing, relatedCase) {
  return firstObjectValue(hearing.raw?.case, hearing.raw?.causa, hearing.raw?.caseData, relatedCase);
}

function getCaseLookupTitle(caseItem) {
  return normalizeLookupKey(firstTextValue(caseItem?.title, caseItem?.titulo, caseItem?.caratula));
}

function enrichHearingsWithCases(hearings = [], cases = []) {
  const caseMap = new Map(
    cases
      .filter((item) => item?.id !== undefined && item?.id !== null)
      .map((item) => [String(item.id), item])
  );
  const caseTitleMap = new Map(
    cases
      .map((item) => [getCaseLookupTitle(item), item])
      .filter(([key]) => Boolean(key))
  );

  return hearings.map((hearing) => {
    const relatedCase =
      caseMap.get(String(hearing?.caseId)) ||
      caseTitleMap.get(normalizeLookupKey(hearing?.caseTitle));

    if (!relatedCase) {
      return hearing;
    }

    return normalizeHearing(
      {
        ...hearing.raw,
        ...hearing,
        case: getRelatedCaseFromHearing(hearing, relatedCase),
        caseTitle:
          hearing.caseTitle === 'Causa sin referencia'
            ? relatedCase.title ?? relatedCase.titulo
            : hearing.caseTitle,
        court: hearing.court || relatedCase.court || relatedCase.juzgado || null,
        modality: hearing.modality || relatedCase.modality || relatedCase.modalidad || null,
      },
      { defaultCase: relatedCase }
    );
  });
}

async function enrichDashboardResumenWithCases(resumen) {
  const needsCaseLookup = resumen.proximasAudiencias.some(shouldEnrichHearingCourt);

  if (!needsCaseLookup) {
    return resumen;
  }

  try {
    const cases = await getCases();

    return {
      ...resumen,
      proximasAudiencias: sortByDateAsc(
        enrichHearingsWithCases(resumen.proximasAudiencias, cases),
        'date'
      ),
    };
  } catch (error) {
    console.error('[DASHBOARD] No pudimos enriquecer audiencias con causas:', error);
    return resumen;
  }
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
        court: caseMap[item.caseId]?.court || null,
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
  error.response = data;
  return error;
}

function getErrorMessage(status, data) {
  if (status === 401 || status === 403) {
    return EXPIRED_SESSION_MESSAGE;
  }

  if (typeof data === 'string' && data.trim()) {
    return data;
  }

  if (data?.message) {
    return data.message;
  }

  if (status >= 500 && data?.details) {
    return typeof data.details === 'string' ? data.details : JSON.stringify(data.details);
  }

  if (status >= 500 && data?.error) {
    return data.error;
  }

  if (status >= 400 && status < 500 && data?.error) {
    if (Array.isArray(data?.missingFields) && data.missingFields.length) {
      return data.error + ': ' + data.missingFields.join(', ');
    }

    return data.error;
  }

  if (status >= 500) {
    return 'No pudimos procesar la solicitud en este momento. Intenta nuevamente en unos minutos.';
  }

  return 'No pudimos completar la solicitud. Intenta nuevamente.';
}

function isProtectedEndpoint(path) {
  return PROTECTED_ENDPOINT_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + '/'));
}

async function getRequestAuthHeaders(path, customHeaders = {}) {
  const hasAuthorizationHeader = Object.keys(customHeaders).some(
    (key) => key.toLowerCase() === 'authorization'
  );

  if (hasAuthorizationHeader) {
    return {
      headers: {},
      token: null,
    };
  }

  if (!isProtectedEndpoint(path)) {
    return {
      headers: getAuthHeaders(),
      token: authToken,
    };
  }

  const currentUser = auth?.currentUser;

  if (!currentUser) {
    throw createRequestError(MISSING_SESSION_MESSAGE, 401);
  }

  try {
    const token = await currentUser.getIdToken();

    if (!token) {
      throw createRequestError(MISSING_SESSION_MESSAGE, 401);
    }

    setAuthToken(token);
    return {
      headers: { Authorization: `Bearer ${token}` },
      token,
    };
  } catch (error) {
    if (error?.status) {
      throw error;
    }

    setAuthToken(null);
    throw createRequestError(EXPIRED_SESSION_MESSAGE, 401, error);
  }
}

export async function request(endpoint, options = {}) {
  if (!API_BASE_URL) {
    throw new Error('Configura API_BASE_URL en src/config/api.js para usar la API real.');
  }

  const requestTimeoutMs =
    Number.isFinite(Number(options.timeout)) && Number(options.timeout) > 0
      ? Number(options.timeout)
      : REQUEST_TIMEOUT_MS;
  const requestTimeoutMessage =
    options.timeoutMessage || 'La solicitud a ' + endpoint + ' supero el maximo de ' + requestTimeoutMs + ' ms.';
  const { timeout, timeoutMessage, ...fetchOptions } = options;
  const path = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
  const url = API_BASE_URL + path;
  const hasJsonBody =
    fetchOptions.body !== undefined &&
    fetchOptions.body !== null &&
    !(fetchOptions.body instanceof FormData) &&
    typeof fetchOptions.body !== 'string';
  const body = hasJsonBody ? JSON.stringify(fetchOptions.body) : fetchOptions.body;
  console.log('[API] baseURL:', API_BASE_URL);
  console.log('[API] endpoint:', endpoint);
  console.log('[API] url:', url);
  console.log('[API] currentUser uid:', auth.currentUser?.uid || null);
  const { headers: authHeaders, token } = await getRequestAuthHeaders(path, fetchOptions.headers);
  console.log('[API] token presente:', Boolean(token));

  let response;
  let responseText = '';

  try {
    response = await runWithTimeout(
      fetch(url, {
        ...fetchOptions,
        body,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined && body !== null && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
          ...authHeaders,
          ...fetchOptions.headers,
        },
      }),
      requestTimeoutMs,
      requestTimeoutMessage
    );
  } catch (error) {
    throw createRequestError(
      error?.message || 'No pudimos conectar con el servidor. Verifica tu conexion e intenta nuevamente.',
      0,
      error
    );
  }

  if (response.status === 204) {
    console.log('[API] status:', response.status);
    console.log('[API] response:', responseText);
    return null;
  }

  const rawText = await response.text();
  responseText = rawText;
  console.log('[API] status:', response.status);
  console.log('[API] response:', responseText);
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

export async function getCurrentIdToken() {
  const currentUser = auth?.currentUser;

  if (!currentUser) {
    throw createRequestError(MISSING_SESSION_MESSAGE, 401);
  }

  try {
    const token = await currentUser.getIdToken();

    if (!token) {
      throw createRequestError(MISSING_SESSION_MESSAGE, 401);
    }

    setAuthToken(token);
    return token;
  } catch (error) {
    if (error?.status) {
      throw error;
    }

    setAuthToken(null);
    throw createRequestError(EXPIRED_SESSION_MESSAGE, 401, error);
  }
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

  const data = await request(DASHBOARD_RESUMEN_ENDPOINT);
  toArray(data?.proximasAudiencias ?? data?.upcomingHearings).forEach((audiencia) => {
    console.log('[DASHBOARD] Audiencia recibida:', JSON.stringify(audiencia, null, 2));
  });

  return enrichDashboardResumenWithCases(normalizeDashboardResumen(data));
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
  const caseHearingIds = new Set(caseHearings.map((item) => String(item?.id)).filter(Boolean));
  const caseDocuments = hasDocuments
    ? normalizedCase.documents
    : documents.filter(
        (item) =>
          item.caseId === normalizedCase.id ||
          caseHearingIds.has(String(item?.hearingId ?? item?.audienciaId ?? ''))
      );

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
    caratula: title,
    descripcion: description,
    juzgado: court,
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

  const endpoint = '/causas';
  const caseData = normalizeCasePayload(data);
  console.log('[API] createCase payload:', JSON.stringify(caseData, null, 2));
  console.log('[API] endpoint:', endpoint);
  const response = await request(endpoint, { method: 'POST', body: caseData });
  return normalizeCase({
    ...response,
    title: response?.title ?? response?.titulo ?? response?.caratula ?? caseData.caratula,
    description: response?.description ?? response?.descripcion ?? caseData.descripcion,
    court: response?.court ?? response?.juzgado ?? caseData.juzgado,
    status: response?.status ?? response?.estado ?? caseData.estado,
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
    title: response?.title ?? response?.titulo ?? response?.caratula ?? payload.caratula,
    description: response?.description ?? response?.descripcion ?? payload.descripcion,
    court: response?.court ?? response?.juzgado ?? payload.juzgado,
    status: response?.status ?? response?.estado ?? payload.estado,
  });
}

export async function getHearings() {
  if (USE_MOCKS) {
    const caseMap = getCaseMap();
    const items = sortByDateAsc(mockStore.hearings, 'date').map((item) =>
      normalizeHearing({
        ...item,
        caseTitle: caseMap[item.caseId]?.title || 'Causa sin referencia',
        court: caseMap[item.caseId]?.court || null,
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
    modality: modality || null,
    modalidad: modality || null,
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

function normalizeTaskPayload(data = {}) {
  const title = safeString(data.title ?? data.titulo, '').trim();
  const description = safeString(data.description ?? data.descripcion ?? data.detail ?? data.detalle, '').trim();
  const dueDate = safeString(data.dueDate ?? data.fechaVencimiento ?? data.fechaProgramada, '').trim();
  const caseId = toNumber(data.caseId ?? data.causaId);
  const status = safeString(data.status ?? data.estado, 'Pendiente').trim();
  const completed =
    typeof data.completed === 'boolean'
      ? data.completed
      : typeof data.completada === 'boolean'
        ? data.completada
        : normalizeStatusLabel(status, 'Pendiente') === 'Finalizada';

  return {
    title,
    titulo: title,
    description,
    descripcion: description,
    dueDate: dueDate || null,
    fechaVencimiento: dueDate || null,
    caseId,
    causaId: caseId,
    status,
    estado: status,
    completed,
    completada: completed,
  };
}

export async function createTask(data) {
  const payload = normalizeTaskPayload(data);

  if (USE_MOCKS) {
    const nextId = Math.max(0, ...mockStore.tasks.map((item) => toNumber(item.id) || 0)) + 1;
    const newTask = normalizeTask({
      id: nextId,
      title: payload.title,
      description: payload.description,
      dueDate: payload.dueDate,
      caseId: payload.caseId,
      status: payload.status,
      completed: payload.completed,
    });

    mockStore.tasks = [newTask, ...mockStore.tasks];
    return simulateDelay(newTask);
  }

  // TODO: conectar este payload con el endpoint real de tareas cuando el backend lo exponga.
  throw createRequestError('La creacion de tareas todavia no esta conectada al backend.', 501, payload);
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
    const asset = data?.asset || null;
    const mockFileName =
      data.fileName ??
      data.nombreArchivo ??
      asset?.name ??
      `documento-${Date.now()}.pdf`;
    const newDocument = normalizeDocument({
      id: nextId,
      hearingId: data.hearingId,
      caseId: hearing?.caseId || null,
      fileName: mockFileName,
      documentType: data.documentType ?? data.tipo ?? 'Documento',
      uploadedAt: new Date().toISOString(),
      path: data.path ?? `/uploads/${safeString(mockFileName, 'documento-simulado.pdf')}`,
    });

    mockStore.documents = [newDocument, ...mockStore.documents];
    return simulateDelay(newDocument);
  }

  const asset = data?.asset || null;
  const hearingId = safeString(data?.hearingId ?? data?.audienciaId, '').trim();
  const documentType = safeString(data?.documentType ?? data?.tipo, '').trim();
  const baseName = safeString(data?.baseName ?? data?.nombreBase, '').trim();

  if (!asset?.uri || !hearingId) {
    throw createRequestError('Selecciona una audiencia y un archivo valido para continuar.', 400);
  }

  const formData = new FormData();
  formData.append('hearingId', String(hearingId));
  if (documentType) {
    formData.append('documentType', documentType);
  }
  if (baseName) {
    formData.append('baseName', baseName);
  }
  formData.append('file', {
    uri: asset.uri,
    name: asset.name || `documento-${Date.now()}.pdf`,
    type: asset.mimeType || 'application/octet-stream',
  });
  const payload = await request('/documentos', { method: 'POST', body: formData });

  await getDocuments().catch(() => []);

  if (!payload) {
    return null;
  }

  return normalizeDocument({
    ...payload,
    hearingId: payload?.hearingId ?? payload?.audienciaId ?? hearingId,
    fileName: payload?.fileName ?? payload?.nombreArchivo ?? asset.name,
    documentType: payload?.documentType ?? payload?.tipo ?? documentType,
  });
}

export async function transcribeDocument(documentId) {
  if (USE_MOCKS) {
    return simulateDelay({
      success: true,
      transcript: 'Transcripcion simulada disponible para esta audiencia.',
      transcriptFilePath: `/uploads/transcripts/documento-${documentId}.txt`,
    });
  }

  return request(`/documentos/${documentId}/transcribir`, { method: 'POST' });
}

function getTranscriptTextFromResponse(data) {
  return safeString(
    data?.text ??
      data?.texto ??
      data?.transcript ??
      data?.transcripcion ??
      data?.fullText ??
      data?.full_text ??
      data?.result?.text ??
      data?.result?.transcript ??
      data?.data?.text ??
      data?.data?.transcript,
    ''
  );
}

function normalizeLiveTranscriptionSession(data = {}) {
  const chunks = toArray(data?.chunks ?? data?.items).map((chunk) => ({
    ...chunk,
    chunkIndex: toNumber(chunk?.chunkIndex ?? chunk?.index) ?? 0,
    startTime: toNumber(chunk?.startTime) ?? 0,
    endTime: toNumber(chunk?.endTime) ?? 0,
    text: getTranscriptTextFromResponse(chunk),
  }));
  const fullText =
    safeString(data?.fullText ?? data?.full_text ?? data?.transcript ?? data?.text, '') ||
    chunks
      .sort((first, second) => first.chunkIndex - second.chunkIndex)
      .map((chunk) => chunk.text)
      .filter(Boolean)
      .join('\n');

  return {
    ...data,
    chunks,
    fullText,
  };
}

export async function startLiveTranscription({ title, caseId, hearingId } = {}) {
  const payload = await request('/transcriptions/start', {
    method: 'POST',
    body: {
      title: safeOptionalString(title) || 'Transcripción en vivo',
      caseId: safeOptionalString(caseId),
      hearingId: safeOptionalString(hearingId),
    },
  });
  const sessionId = payload?.sessionId ?? payload?.id;

  if (!sessionId) {
    throw createRequestError('El backend no devolvio sessionId.', 500, payload);
  }

  return sessionId;
}

export async function uploadLiveTranscriptionChunk({
  sessionId,
  audioUri,
  chunkIndex,
  startTime,
  endTime,
} = {}) {
  if (!sessionId || !audioUri) {
    throw createRequestError('No hay una sesion o archivo de audio valido para enviar.', 400);
  }

  const formData = new FormData();
  formData.append('audio', {
    uri: audioUri,
    name: `chunk-${chunkIndex}.m4a`,
    type: 'audio/m4a',
  });
  formData.append('chunkIndex', String(chunkIndex));
  formData.append('startTime', String(startTime));
  formData.append('endTime', String(endTime));

  const payload = await request(`/transcriptions/${sessionId}/chunk`, {
    method: 'POST',
    timeout: 150000,
    timeoutMessage: 'La transcripcion del bloque tardo demasiado. El siguiente bloque puede continuar.',
    body: formData,
  });

  return {
    ...payload,
    chunkIndex: payload?.chunkIndex ?? chunkIndex,
    startTime: payload?.startTime ?? startTime,
    endTime: payload?.endTime ?? endTime,
    text: getTranscriptTextFromResponse(payload),
  };
}

export async function finishLiveTranscription(sessionId) {
  if (!sessionId) {
    throw createRequestError('No hay una sesion activa para finalizar.', 400);
  }

  const payload = await request(`/transcriptions/${sessionId}/finish`, {
    method: 'POST',
    timeout: 150000,
    timeoutMessage: 'No pudimos finalizar la sesion de transcripcion dentro del tiempo esperado.',
  });

  return normalizeLiveTranscriptionSession(payload || {});
}

export async function getLiveTranscription(sessionId) {
  if (!sessionId) {
    throw createRequestError('No hay una sesion activa para consultar.', 400);
  }

  const payload = await request(`/transcriptions/${sessionId}`);
  return normalizeLiveTranscriptionSession(payload || {});
}

export async function startTranscriptionSession(data = {}) {
  const sessionId = await startLiveTranscription(data);

  return {
    sessionId,
  };
}

export async function uploadTranscriptionChunk(sessionId, data = {}) {
  return uploadLiveTranscriptionChunk({
    sessionId,
    audioUri: data?.audio?.uri,
    chunkIndex: data?.chunkIndex,
    startTime: data?.startTime,
    endTime: data?.endTime,
  });
}

export async function finishTranscriptionSession(sessionId) {
  return finishLiveTranscription(sessionId);
}

export async function getTranscriptionSession(sessionId) {
  return getLiveTranscription(sessionId);
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

export async function sendLuxMessage(message, context = {}) {
  const normalizedMessage = safeString(message, '').trim();

  if (!normalizedMessage) {
    return {
      success: false,
      reply: 'Escribe una consulta para que LUX pueda ayudarte.',
    };
  }

  try {
    const data = await request('/lux/chat', {
      method: 'POST',
      timeout: LUX_REQUEST_TIMEOUT_MS,
      timeoutMessage: LUX_TIMEOUT_ERROR_MESSAGE,
      body: {
        message: normalizedMessage,
        context: {
          screen: 'dashboard',
          ...context,
        },
      },
    });

    const reply = safeString(data?.reply, LUX_CONNECTION_ERROR_MESSAGE);

    return {
      success: Boolean(data?.success),
      reply,
      raw: data,
    };
  } catch (error) {
    console.error('[LUX] No pudimos conectar con el asistente:', error);
    const isTimeout = error?.message === LUX_TIMEOUT_ERROR_MESSAGE;

    return {
      success: false,
      reply: isTimeout ? LUX_TIMEOUT_ERROR_MESSAGE : LUX_CONNECTION_ERROR_MESSAGE,
      error,
    };
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
