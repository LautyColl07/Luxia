import Constants from 'expo-constants';

import { auth } from '../config/firebase';
import mockData from '../data/mockData';
import { normalizeStatusLabel } from '../utils/status';
import { getUserDisplayName, getUserEmail, getUserRole } from '../utils/userDisplay';

export const USE_MOCKS = false;
export const CASE_SCOPES = {
  PRIVATE: 'PRIVATE',
  LEGAL_STUDY: 'LEGAL_STUDY',
};
export const LEGAL_STUDY_ROLES = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
  VIEWER: 'VIEWER',
};
export const MEMBER_STATUSES = {
  ACTIVE: 'ACTIVE',
  PENDING: 'PENDING',
  REMOVED: 'REMOVED',
};
export const WORK_CONTEXT_TYPES = {
  PERSONAL: 'PERSONAL',
  LEGAL_STUDY: 'LEGAL_STUDY',
  ALL: 'ALL',
};

const DEFAULT_API_BASE_URL = 'http://172.16.4.48:3000/api/v1';
const DASHBOARD_RESUMEN_ENDPOINT = '/dashboard/resumen';

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  Constants.expoConfig?.extra?.apiBaseUrl ||
  DEFAULT_API_BASE_URL
).replace(/\/+$/, '');

export const FILE_BASE_URL = API_BASE_URL.replace(/\/api\/v1$/, '');

let authToken = null;
let mockStore = JSON.parse(JSON.stringify(mockData));
const REQUEST_TIMEOUT_MS = 8000;
const EXPIRED_SESSION_MESSAGE = 'Tu sesión expiró. Iniciá sesión nuevamente.';
const MISSING_SESSION_MESSAGE = 'No hay una sesión activa. Iniciá sesión nuevamente.';
const PROTECTED_ENDPOINT_PREFIXES = [
  '/dashboard/resumen',
  '/auth/me',
  '/causas',
  '/cases',
  '/audiencias',
  '/documentos',
  '/legal-studies',
];

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

function buildQueryString(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    searchParams.append(key, String(value));
  });

  const serialized = searchParams.toString();
  return serialized ? `?${serialized}` : '';
}

function getCurrentAppUserId() {
  if (USE_MOCKS) {
    const authUser = getAuthenticatedUserCandidate();
    const mappedUser =
      getMockUserById(authUser?.id) ||
      mockStore.users.find((item) => safeString(item?.email).toLowerCase() === safeString(authUser?.email).toLowerCase()) ||
      null;

    return mappedUser?.id || mockStore.user?.id || authUser?.id || null;
  }

  return auth?.currentUser?.uid || mockStore.user?.id || null;
}

function getMockUserById(userId) {
  return mockStore.users.find((item) => String(item?.id) === String(userId)) || null;
}

function getCurrentMockUser() {
  const authUser = getAuthenticatedUserCandidate();
  const currentUserId = getCurrentAppUserId();
  const existingUser =
    getMockUserById(currentUserId) ||
    mockStore.users.find((item) => safeString(item?.email).toLowerCase() === safeString(authUser?.email).toLowerCase()) ||
    null;

  if (existingUser) {
    return {
      ...existingUser,
      id: currentUserId || existingUser.id,
      firebaseUid: authUser?.id || existingUser.firebaseUid || existingUser.id,
      displayName: authUser?.displayName || existingUser.name,
      email: authUser?.email || existingUser.email,
    };
  }

  return {
    ...mockStore.user,
    id: currentUserId || mockStore.user?.id,
    firebaseUid: authUser?.id || mockStore.user?.firebaseUid,
    email: authUser?.email || mockStore.user?.email,
    name: authUser?.displayName || mockStore.user?.name,
  };
}

function getCurrentUserReference() {
  return normalizeUser(getCurrentMockUser(), getAuthenticatedUserCandidate() || {});
}

function getLegalStudyMap() {
  return mockStore.legalStudies.reduce((accumulator, item) => {
    accumulator[item.id] = item;
    return accumulator;
  }, {});
}

function normalizeMemberStatus(value) {
  const normalized = safeString(value, MEMBER_STATUSES.ACTIVE).toUpperCase();
  return MEMBER_STATUSES[normalized] || MEMBER_STATUSES.ACTIVE;
}

function normalizeLegalStudyRole(value) {
  const normalized = safeString(value, LEGAL_STUDY_ROLES.MEMBER).toUpperCase();
  return LEGAL_STUDY_ROLES[normalized] || LEGAL_STUDY_ROLES.MEMBER;
}

function getRoleLabel(role) {
  switch (normalizeLegalStudyRole(role)) {
    case LEGAL_STUDY_ROLES.OWNER:
      return 'Owner';
    case LEGAL_STUDY_ROLES.ADMIN:
      return 'Admin';
    case LEGAL_STUDY_ROLES.VIEWER:
      return 'Solo lectura';
    default:
      return 'Miembro';
  }
}

function getScopeLabel(scope) {
  return scope === CASE_SCOPES.LEGAL_STUDY ? 'Estudio Juridico' : 'Privada';
}

function getMemberPriority(role) {
  switch (normalizeLegalStudyRole(role)) {
    case LEGAL_STUDY_ROLES.OWNER:
      return 0;
    case LEGAL_STUDY_ROLES.ADMIN:
      return 1;
    case LEGAL_STUDY_ROLES.MEMBER:
      return 2;
    default:
      return 3;
  }
}

function getActiveMembership(userId, legalStudyId) {
  return (
    mockStore.legalStudyMembers.find(
      (item) =>
        String(item?.userId) === String(userId) &&
        String(item?.legalStudyId) === String(legalStudyId) &&
        normalizeMemberStatus(item?.status) === MEMBER_STATUSES.ACTIVE
    ) || null
  );
}

function getMembershipForStudy(userId, legalStudyId) {
  return (
    mockStore.legalStudyMembers.find(
      (item) =>
        String(item?.userId) === String(userId) &&
        String(item?.legalStudyId) === String(legalStudyId)
    ) || null
  );
}

function getActiveMembershipsForUser(userId = getCurrentAppUserId()) {
  return mockStore.legalStudyMembers.filter(
    (item) =>
      String(item?.userId) === String(userId) &&
      normalizeMemberStatus(item?.status) === MEMBER_STATUSES.ACTIVE
  );
}

function canViewStudyMembership(membership) {
  return normalizeMemberStatus(membership?.status) === MEMBER_STATUSES.ACTIVE;
}

function canManageMembershipRole(role) {
  const normalizedRole = normalizeLegalStudyRole(role);
  return normalizedRole === LEGAL_STUDY_ROLES.OWNER || normalizedRole === LEGAL_STUDY_ROLES.ADMIN;
}

function canInviteFromMembership(membership) {
  return canManageMembershipRole(membership?.role);
}

function canCreateStudyCaseFromMembership(membership) {
  const normalizedRole = normalizeLegalStudyRole(membership?.role);
  return canViewStudyMembership(membership) && normalizedRole !== LEGAL_STUDY_ROLES.VIEWER;
}

function normalizeCaseScope(scope) {
  const normalized = safeString(scope, CASE_SCOPES.PRIVATE).toUpperCase();
  return CASE_SCOPES[normalized] || CASE_SCOPES.PRIVATE;
}

function getStudyCapabilitiesForUser(userId, legalStudyId) {
  const membership = getActiveMembership(userId, legalStudyId);
  const normalizedRole = normalizeLegalStudyRole(membership?.role);

  return {
    canView: Boolean(membership),
    canManage: canManageMembershipRole(normalizedRole),
    canInvite: canInviteFromMembership(membership),
    canCreateCase: canCreateStudyCaseFromMembership(membership),
    isReadOnly: normalizedRole === LEGAL_STUDY_ROLES.VIEWER,
    role: membership ? normalizedRole : null,
    membership,
  };
}

function canEditCaseRecord(caseItem, userId = getCurrentAppUserId()) {
  if (!caseItem) {
    return false;
  }

  const normalizedScope = normalizeCaseScope(caseItem.scope ?? caseItem.caseScope);

  if (normalizedScope === CASE_SCOPES.PRIVATE) {
    return String(caseItem.ownerUserId) === String(userId);
  }

  const capabilities = getStudyCapabilitiesForUser(userId, caseItem.legalStudyId);

  if (capabilities.role === LEGAL_STUDY_ROLES.OWNER || capabilities.role === LEGAL_STUDY_ROLES.ADMIN) {
    return true;
  }

  return capabilities.role === LEGAL_STUDY_ROLES.MEMBER && String(caseItem.ownerUserId) === String(userId);
}

function canDeleteCaseRecord(caseItem, userId = getCurrentAppUserId()) {
  return canEditCaseRecord(caseItem, userId);
}

function isCaseVisibleToUser(caseItem, userId = getCurrentAppUserId()) {
  if (!caseItem) {
    return false;
  }

  const normalizedScope = normalizeCaseScope(caseItem.scope ?? caseItem.caseScope);

  if (normalizedScope === CASE_SCOPES.PRIVATE) {
    return String(caseItem.ownerUserId) === String(userId);
  }

  return Boolean(getActiveMembership(userId, caseItem.legalStudyId));
}

function filterMockCasesByScope(caseItems, filters = {}, userId = getCurrentAppUserId()) {
  const scope = safeString(filters.scope, 'all').toLowerCase();
  const legalStudyId = filters.legalStudyId ? String(filters.legalStudyId) : null;
  const activeMemberships = getActiveMembershipsForUser(userId);
  const activeStudyIds = new Set(activeMemberships.map((item) => String(item.legalStudyId)));

  return caseItems.filter((item) => {
    const normalizedScope = normalizeCaseScope(item.scope ?? item.caseScope);
    const isPrivateCase = normalizedScope === CASE_SCOPES.PRIVATE && String(item.ownerUserId) === String(userId);
    const isStudyCase =
      normalizedScope === CASE_SCOPES.LEGAL_STUDY &&
      item.legalStudyId &&
      activeStudyIds.has(String(item.legalStudyId));

    if (scope === 'private') {
      return isPrivateCase;
    }

    if (scope === 'legal_study') {
      if (!legalStudyId) {
        return false;
      }

      return isStudyCase && String(item.legalStudyId) === legalStudyId;
    }

    return isPrivateCase || isStudyCase;
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
  const currentUserId = getCurrentAppUserId();
  const visibleCases = mockStore.cases.filter((item) => isCaseVisibleToUser(item, currentUserId));
  const visibleCaseIds = new Set(visibleCases.map((item) => item.id));

  return {
    causasActivas: visibleCases.filter((item) => {
      const normalizedStatus = normalizeStatusLabel(item?.status, 'Activa');
      return normalizedStatus !== 'Finalizada' && normalizedStatus !== 'Archivada';
    }).length,
    audienciasHoy: mockStore.hearings.filter((item) => visibleCaseIds.has(item.caseId) && new Date(item.date).toDateString() === now.toDateString()).length,
    documentos: mockStore.documents.filter((item) => visibleCaseIds.has(item.caseId)).length,
    tareasPendientes: mockStore.tasks.filter((item) => visibleCaseIds.has(item.caseId) && !item.completed).length,
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

function normalizeLegalStudyMember(member, context = {}) {
  const source = member || {};
  const relatedUser = source.user || getMockUserById(source.userId) || {};
  const user = normalizeUser(relatedUser);
  const role = normalizeLegalStudyRole(source.role);
  const status = normalizeMemberStatus(source.status);

  return {
    ...source,
    id: safeString(source.id),
    userId: safeString(source.userId ?? user.id),
    legalStudyId: safeString(source.legalStudyId ?? context.legalStudyId),
    role,
    roleLabel: getRoleLabel(role),
    status,
    statusLabel:
      status === MEMBER_STATUSES.PENDING
        ? 'Pendiente'
        : status === MEMBER_STATUSES.REMOVED
          ? 'Removido'
          : 'Activo',
    user,
    createdAt: normalizeDateValue(source.createdAt),
    updatedAt: normalizeDateValue(source.updatedAt),
  };
}

function normalizeLegalStudy(legalStudy, context = {}) {
  const source = legalStudy || {};
  const currentUserId = context.currentUserId || getCurrentAppUserId();
  const members = toArray(source.members).length
    ? toArray(source.members).map((item) => normalizeLegalStudyMember(item, { legalStudyId: source.id }))
    : mockStore.legalStudyMembers
        .filter((item) => String(item?.legalStudyId) === String(source.id))
        .map((item) => normalizeLegalStudyMember(item, { legalStudyId: source.id }));
  const owner = normalizeUser(source.owner || getMockUserById(source.ownerId));
  const membership =
    normalizeLegalStudyMember(
      source.currentMembership ||
        source.membership ||
        members.find((item) => String(item?.userId) === String(currentUserId)) ||
        {},
      { legalStudyId: source.id }
    ) || null;
  const resolvedRole = membership?.role || (source.currentUserRole ? normalizeLegalStudyRole(source.currentUserRole) : null);
  const fallbackCapabilities = getStudyCapabilitiesForUser(currentUserId, source.id);
  const capabilities = {
    canView: source.capabilities?.canView ?? Boolean(membership?.id || fallbackCapabilities.canView),
    canManage:
      source.capabilities?.canManage ??
      [LEGAL_STUDY_ROLES.OWNER, LEGAL_STUDY_ROLES.ADMIN].includes(resolvedRole || ''),
    canInvite:
      source.capabilities?.canInvite ??
      [LEGAL_STUDY_ROLES.OWNER, LEGAL_STUDY_ROLES.ADMIN].includes(resolvedRole || ''),
    canCreateCase:
      source.capabilities?.canCreateCase ??
      [LEGAL_STUDY_ROLES.OWNER, LEGAL_STUDY_ROLES.ADMIN, LEGAL_STUDY_ROLES.MEMBER].includes(resolvedRole || ''),
    isReadOnly: source.capabilities?.isReadOnly ?? resolvedRole === LEGAL_STUDY_ROLES.VIEWER,
    role: resolvedRole || fallbackCapabilities.role || null,
    membership: membership?.id ? membership : fallbackCapabilities.membership || null,
  };

  return {
    ...source,
    id: safeString(source.id),
    name: safeString(source.name, 'Estudio Juridico'),
    description: safeOptionalString(source.description),
    ownerId: safeString(source.ownerId ?? owner.id),
    owner,
    members: members.sort((first, second) => getMemberPriority(first.role) - getMemberPriority(second.role)),
    membersCount: members.filter((item) => item.status === MEMBER_STATUSES.ACTIVE).length,
    pendingMembersCount: members.filter((item) => item.status === MEMBER_STATUSES.PENDING).length,
    currentMembership: membership?.id ? membership : null,
    currentUserRole: capabilities.role,
    currentUserRoleLabel: capabilities.role ? getRoleLabel(capabilities.role) : null,
    capabilities,
    createdAt: normalizeDateValue(source.createdAt),
    updatedAt: normalizeDateValue(source.updatedAt),
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
  const updatedAt = normalizeDateValue(source.updatedAt ?? source.fechaActualizacion ?? source.modifiedAt ?? createdAt);
  const scope = normalizeCaseScope(source.scope ?? source.caseScope);
  const legalStudyRef = source.legalStudy ?? source.estudioJuridico ?? getLegalStudyMap()[source.legalStudyId];
  const legalStudy = legalStudyRef ? normalizeLegalStudy(legalStudyRef) : null;
  const legalStudyId = legalStudy?.id || safeOptionalString(source.legalStudyId ?? source.estudioJuridicoId);
  const ownerUserId = safeString(source.ownerUserId ?? source.ownerId ?? source.usuarioCreadorId, getCurrentUserReference()?.id);
  const currentUserId = getCurrentAppUserId();
  const roleFromSource = safeOptionalString(source.currentUserRole ?? source.roleInStudy);
  const fallbackStudyCapabilities = legalStudyId ? getStudyCapabilitiesForUser(currentUserId, legalStudyId) : null;
  const studyCapabilities = legalStudyId
    ? {
        ...fallbackStudyCapabilities,
        role: roleFromSource || fallbackStudyCapabilities?.role || null,
        isReadOnly:
          typeof source.isReadOnly === 'boolean'
            ? source.isReadOnly
            : roleFromSource === LEGAL_STUDY_ROLES.VIEWER ||
              fallbackStudyCapabilities?.isReadOnly,
      }
    : null;
  const permissionSource = source.permissions || {};
  const canEdit = typeof permissionSource.canEdit === 'boolean' ? permissionSource.canEdit : canEditCaseRecord(source, currentUserId);
  const canDelete = typeof permissionSource.canDelete === 'boolean' ? permissionSource.canDelete : canDeleteCaseRecord(source, currentUserId);
  const isReadOnly =
    typeof permissionSource.isReadOnly === 'boolean'
      ? permissionSource.isReadOnly
      : typeof source.isReadOnly === 'boolean'
        ? source.isReadOnly
        : Boolean(studyCapabilities?.isReadOnly && scope === CASE_SCOPES.LEGAL_STUDY);
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
    scope,
    caseScope: scope,
    scopeLabel: getScopeLabel(scope),
    ownerUserId,
    legalStudyId: scope === CASE_SCOPES.LEGAL_STUDY ? legalStudyId : null,
    legalStudy,
    legalStudyName: legalStudy?.name || safeOptionalString(source.legalStudyName ?? source.estudioJuridicoNombre),
    currentUserRole: studyCapabilities?.role || safeOptionalString(source.currentUserRole),
    currentUserRoleLabel: studyCapabilities?.role ? getRoleLabel(studyCapabilities.role) : null,
    permissions: {
      canEdit,
      canDelete,
      canView: typeof permissionSource.canView === 'boolean' ? permissionSource.canView : true,
      isReadOnly,
    },
    isReadOnly,
    createdAt,
    updatedAt,
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
  const currentUserId = getCurrentAppUserId();

  return mockStore.hearings
    .filter((item) => isCaseVisibleToUser(caseMap[item.caseId], currentUserId))
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
  const caseItem = mockStore.cases.find((item) => String(item.id) === String(id));

  if (!caseItem) {
    throw new Error('No encontramos la causa solicitada.');
  }

  if (!isCaseVisibleToUser(caseItem, getCurrentAppUserId())) {
    throw createRequestError('No tenes permisos para realizar esta accion.', 403);
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
  if (status === 401 || status === 403) {
    return EXPIRED_SESSION_MESSAGE;
  }

  if (typeof data === 'string' && data.trim()) {
    return data;
  }

  if (data?.message) {
    return data.message;
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
    throw new Error('Defini EXPO_PUBLIC_API_BASE_URL para usar la API real.');
  }

  const path = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
  const url = API_BASE_URL + path;
  const hasJsonBody =
    options.body !== undefined &&
    options.body !== null &&
    !(options.body instanceof FormData) &&
    typeof options.body !== 'string';
  const body = hasJsonBody ? JSON.stringify(options.body) : options.body;
  console.log('[API] endpoint:', endpoint);
  console.log('[API] url:', url);
  console.log('[API] currentUser uid:', auth.currentUser?.uid || null);
  const { headers: authHeaders, token } = await getRequestAuthHeaders(path, options.headers);
  console.log('[API] token presente:', Boolean(token));

  let response;
  let responseText = '';

  try {
    response = await runWithTimeout(
      fetch(url, {
        ...options,
        body,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined && body !== null && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
          ...authHeaders,
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

async function requestWithFallback(paths, options = {}) {
  let lastError = null;

  for (const path of paths) {
    try {
      return await request(path, options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || createRequestError('No pudimos completar la solicitud.', 0);
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
    return simulateDelay(getCurrentUserReference());
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
      usuario: getCurrentUserReference(),
      metricas: getMetrics(),
      proximasAudiencias: mapUpcomingHearings(),
    });
  }

  const data = await request(DASHBOARD_RESUMEN_ENDPOINT);
  return normalizeDashboardResumen(data);
}

export async function getLegalStudies() {
  if (USE_MOCKS) {
    const userId = getCurrentAppUserId();
    const studies = mockStore.legalStudies
      .filter((item) => Boolean(getActiveMembership(userId, item.id)))
      .map((item) => normalizeLegalStudy(item, { currentUserId: userId }))
      .sort((first, second) => String(first.name).localeCompare(String(second.name)));

    return simulateDelay(studies);
  }

  const data = await request('/legal-studies/my');
  return toArray(data).map((item) => normalizeLegalStudy(item));
}

export async function getLegalStudyById(id) {
  if (USE_MOCKS) {
    const userId = getCurrentAppUserId();
    const study = mockStore.legalStudies.find((item) => String(item.id) === String(id));

    if (!study || !getActiveMembership(userId, id)) {
      throw createRequestError('Estudio Juridico no encontrado.', 404);
    }

    return simulateDelay(normalizeLegalStudy(study, { currentUserId: userId }));
  }

  const data = await request(`/legal-studies/${id}`);
  return normalizeLegalStudy(data);
}

export async function createLegalStudy(data = {}) {
  const payload = {
    name: safeString(data.name, '').trim(),
    description: safeString(data.description, '').trim(),
  };

  if (!payload.name) {
    throw createRequestError('Datos invalidos.', 400);
  }

  if (USE_MOCKS) {
    const currentUser = getCurrentUserReference();
    const legalStudyId = `ls-${Date.now()}`;
    const createdAt = new Date().toISOString();
    const legalStudy = {
      id: legalStudyId,
      name: payload.name,
      description: payload.description || null,
      ownerId: currentUser.id,
      createdAt,
      updatedAt: createdAt,
    };
    const membership = {
      id: `lsm-${Date.now()}`,
      userId: currentUser.id,
      legalStudyId,
      role: LEGAL_STUDY_ROLES.OWNER,
      status: MEMBER_STATUSES.ACTIVE,
      createdAt,
      updatedAt: createdAt,
    };

    mockStore.legalStudies = [legalStudy, ...mockStore.legalStudies];
    mockStore.legalStudyMembers = [membership, ...mockStore.legalStudyMembers];
    return simulateDelay(normalizeLegalStudy(legalStudy, { currentUserId: currentUser.id }));
  }

  const response = await request('/legal-studies', { method: 'POST', body: payload });
  return normalizeLegalStudy(response);
}

export async function updateLegalStudy(id, data = {}) {
  const payload = {
    name: safeString(data.name, '').trim(),
    description: safeString(data.description, '').trim(),
  };

  if (USE_MOCKS) {
    const currentUserId = getCurrentAppUserId();
    const capabilities = getStudyCapabilitiesForUser(currentUserId, id);

    if (!capabilities.canManage) {
      throw createRequestError('No tenes permisos para realizar esta accion.', 403);
    }

    mockStore.legalStudies = mockStore.legalStudies.map((item) =>
      String(item.id) === String(id)
        ? {
            ...item,
            name: payload.name || item.name,
            description: payload.description || null,
            updatedAt: new Date().toISOString(),
          }
        : item
    );

    const updatedStudy = mockStore.legalStudies.find((item) => String(item.id) === String(id));
    return simulateDelay(normalizeLegalStudy(updatedStudy, { currentUserId }));
  }

  const response = await request(`/legal-studies/${id}`, { method: 'PATCH', body: payload });
  return normalizeLegalStudy(response);
}

export async function getLegalStudyMembers(id) {
  if (USE_MOCKS) {
    const currentUserId = getCurrentAppUserId();

    if (!getActiveMembership(currentUserId, id)) {
      throw createRequestError('No tenes permisos para realizar esta accion.', 403);
    }

    const members = mockStore.legalStudyMembers
      .filter((item) => String(item.legalStudyId) === String(id))
      .map((item) => normalizeLegalStudyMember(item, { legalStudyId: id }))
      .sort((first, second) => getMemberPriority(first.role) - getMemberPriority(second.role));

    return simulateDelay(members);
  }

  const data = await request(`/legal-studies/${id}/members`);
  return toArray(data).map((item) => normalizeLegalStudyMember(item, { legalStudyId: id }));
}

export async function inviteLegalStudyMember(id, data = {}) {
  const email = safeString(data.email, '').trim().toLowerCase();
  const role = normalizeLegalStudyRole(data.role);

  if (!email) {
    throw createRequestError('Datos invalidos.', 400);
  }

  if (USE_MOCKS) {
    const currentUserId = getCurrentAppUserId();

    if (!canInviteFromMembership(getActiveMembership(currentUserId, id))) {
      throw createRequestError('No tenes permisos para realizar esta accion.', 403);
    }

    const existingUser =
      mockStore.users.find((item) => safeString(item?.email).toLowerCase() === email) || null;
    const userId = existingUser?.id || `mock-user-${Date.now()}`;
    const existingMembership = getMembershipForStudy(userId, id);

    if (existingMembership) {
      throw createRequestError('El usuario ya pertenece a este Estudio Juridico.', 409);
    }

    if (!existingUser) {
      mockStore.users = [
        ...mockStore.users,
        {
          id: userId,
          firebaseUid: userId,
          name: email.split('@')[0],
          email,
          role: 'Invitado',
        },
      ];
    }

    const createdAt = new Date().toISOString();
    const newMembership = {
      id: `lsm-${Date.now()}`,
      userId,
      legalStudyId: id,
      role,
      status: existingUser ? MEMBER_STATUSES.ACTIVE : MEMBER_STATUSES.PENDING,
      createdAt,
      updatedAt: createdAt,
    };

    mockStore.legalStudyMembers = [newMembership, ...mockStore.legalStudyMembers];
    return simulateDelay(normalizeLegalStudyMember(newMembership, { legalStudyId: id }));
  }

  const response = await request(`/legal-studies/${id}/members`, {
    method: 'POST',
    body: { email, role },
  });

  return normalizeLegalStudyMember(response, { legalStudyId: id });
}

export async function updateLegalStudyMember(legalStudyId, memberId, data = {}) {
  const role = data.role ? normalizeLegalStudyRole(data.role) : undefined;
  const status = data.status ? normalizeMemberStatus(data.status) : undefined;

  if (USE_MOCKS) {
    const currentUserId = getCurrentAppUserId();
    const managerMembership = getActiveMembership(currentUserId, legalStudyId);

    if (!canManageMembershipRole(managerMembership?.role)) {
      throw createRequestError('No tenes permisos para realizar esta accion.', 403);
    }

    const targetMembership = mockStore.legalStudyMembers.find((item) => String(item.id) === String(memberId));

    if (!targetMembership || String(targetMembership.legalStudyId) !== String(legalStudyId)) {
      throw createRequestError('Estudio Juridico no encontrado.', 404);
    }

    if (normalizeLegalStudyRole(targetMembership.role) === LEGAL_STUDY_ROLES.OWNER) {
      throw createRequestError('No tenes permisos para realizar esta accion.', 403);
    }

    mockStore.legalStudyMembers = mockStore.legalStudyMembers.map((item) =>
      String(item.id) === String(memberId)
        ? {
            ...item,
            role: role || item.role,
            status: status || item.status,
            updatedAt: new Date().toISOString(),
          }
        : item
    );

    const updatedMembership = mockStore.legalStudyMembers.find((item) => String(item.id) === String(memberId));
    return simulateDelay(normalizeLegalStudyMember(updatedMembership, { legalStudyId }));
  }

  const response = await request(`/legal-studies/${legalStudyId}/members/${memberId}`, {
    method: 'PATCH',
    body: { role, status },
  });

  return normalizeLegalStudyMember(response, { legalStudyId });
}

export async function removeLegalStudyMember(legalStudyId, memberId) {
  if (USE_MOCKS) {
    const currentUserId = getCurrentAppUserId();
    const managerMembership = getActiveMembership(currentUserId, legalStudyId);

    if (!canManageMembershipRole(managerMembership?.role)) {
      throw createRequestError('No tenes permisos para realizar esta accion.', 403);
    }

    const targetMembership = mockStore.legalStudyMembers.find((item) => String(item.id) === String(memberId));

    if (!targetMembership || String(targetMembership.legalStudyId) !== String(legalStudyId)) {
      throw createRequestError('Estudio Juridico no encontrado.', 404);
    }

    if (normalizeLegalStudyRole(targetMembership.role) === LEGAL_STUDY_ROLES.OWNER) {
      throw createRequestError('No tenes permisos para realizar esta accion.', 403);
    }

    mockStore.legalStudyMembers = mockStore.legalStudyMembers.map((item) =>
      String(item.id) === String(memberId)
        ? {
            ...item,
            status: MEMBER_STATUSES.REMOVED,
            updatedAt: new Date().toISOString(),
          }
        : item
    );

    return simulateDelay(null);
  }

  return request(`/legal-studies/${legalStudyId}/members/${memberId}`, { method: 'DELETE' });
}

export async function getCases(filters = {}) {
  if (USE_MOCKS) {
    const userId = getCurrentAppUserId();
    const cases = sortByDateDesc(filterMockCasesByScope(mockStore.cases, filters, userId), 'updatedAt').map((item) =>
      normalizeCase(item)
    );
    return simulateDelay(cases);
  }

  const query = buildQueryString({
    scope: filters.scope,
    legalStudyId: filters.legalStudyId,
  });
  const data = await requestWithFallback([`/cases${query}`, `/causas${query}`]);
  return sortByDateDesc(toArray(data).map((item) => normalizeCase(item)), 'createdAt');
}

export async function getCaseById(id) {
  if (USE_MOCKS) {
    return simulateDelay(getCaseDetailMock(id));
  }

  const data = await requestWithFallback([`/cases/${id}`, `/causas/${id}`]);
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
  const scope = normalizeCaseScope(data.scope ?? data.caseScope);
  const legalStudyId =
    scope === CASE_SCOPES.LEGAL_STUDY ? safeString(data.legalStudyId ?? data.estudioJuridicoId, '').trim() : null;

  return {
    title,
    titulo: title,
    description,
    descripcion: description,
    court,
    juzgado: court,
    status,
    estado: status,
    scope,
    legalStudyId,
  };
}

export async function createCase(data) {
  const payload = normalizeCasePayload(data);

  if (USE_MOCKS) {
    const currentUser = getCurrentUserReference();

    if (!payload.title) {
      throw createRequestError('Datos invalidos.', 400);
    }

    if (payload.scope === CASE_SCOPES.LEGAL_STUDY) {
      const membership = getMembershipForStudy(currentUser.id, payload.legalStudyId);

      if (!payload.legalStudyId || !membership) {
        throw createRequestError('No tenes permisos para realizar esta accion.', 403);
      }

      if (normalizeMemberStatus(membership.status) !== MEMBER_STATUSES.ACTIVE) {
        throw createRequestError('No tenes permisos para realizar esta accion.', 403);
      }

      if (!canCreateStudyCaseFromMembership(membership)) {
        throw createRequestError('Tu rol actual es de solo lectura.', 403);
      }
    }

    const nextId = Math.max(0, ...mockStore.cases.map((item) => item.id)) + 1;
    const newCase = normalizeCase({
      id: nextId,
      title: payload.title,
      description: payload.description,
      court: payload.court,
      status: payload.status,
      scope: payload.scope,
      legalStudyId: payload.scope === CASE_SCOPES.LEGAL_STUDY ? payload.legalStudyId : null,
      ownerUserId: currentUser.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    mockStore.cases = [newCase, ...mockStore.cases];
    return simulateDelay(newCase);
  }

  const response = await requestWithFallback(['/cases', '/causas'], { method: 'POST', body: payload });
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
    const caseIndex = mockStore.cases.findIndex((item) => String(item.id) === String(id));

    if (caseIndex === -1) {
      throw new Error('No encontramos la causa solicitada.');
    }

    const currentCase = mockStore.cases[caseIndex];

    if (!canEditCaseRecord(currentCase, getCurrentAppUserId())) {
      throw createRequestError('No tenes permisos para realizar esta accion.', 403);
    }

    const updatedCase = normalizeCase({
      ...currentCase,
      title: data.title ?? data.titulo ?? currentCase.title,
      description: data.description ?? data.descripcion ?? currentCase.description,
      court: data.court ?? data.juzgado ?? currentCase.court,
      status: data.status ?? data.estado ?? currentCase.status,
      updatedAt: new Date().toISOString(),
    });

    mockStore.cases = mockStore.cases.map((item) => (String(item.id) === String(id) ? updatedCase : item));
    return simulateDelay(updatedCase);
  }

  const payload = normalizeCasePayload(data);
  const response = await requestWithFallback([`/cases/${id}`, `/causas/${id}`], { method: 'PUT', body: payload });
  return normalizeCase({
    ...response,
    id,
    title: response?.title ?? payload.title,
    description: response?.description ?? payload.description,
    court: response?.court ?? payload.court,
    status: response?.status ?? payload.status,
  });
}

export async function deleteCase(id) {
  if (USE_MOCKS) {
    const caseItem = mockStore.cases.find((item) => String(item.id) === String(id));

    if (!caseItem) {
      throw createRequestError('No encontramos la causa solicitada.', 404);
    }

    if (!canDeleteCaseRecord(caseItem, getCurrentAppUserId())) {
      throw createRequestError('No tenes permisos para realizar esta accion.', 403);
    }

    mockStore.cases = mockStore.cases.filter((item) => String(item.id) !== String(id));
    mockStore.hearings = mockStore.hearings.filter((item) => String(item.caseId) !== String(id));
    mockStore.documents = mockStore.documents.filter((item) => String(item.caseId) !== String(id));
    mockStore.tasks = mockStore.tasks.filter((item) => String(item.caseId) !== String(id));
    return simulateDelay(null);
  }

  return requestWithFallback([`/cases/${id}`, `/causas/${id}`], { method: 'DELETE' });
}

export async function getHearings() {
  if (USE_MOCKS) {
    const caseMap = getCaseMap();
    const currentUserId = getCurrentAppUserId();
    const items = sortByDateAsc(mockStore.hearings, 'date').map((item) =>
      normalizeHearing({
        ...item,
        caseTitle: caseMap[item.caseId]?.title || 'Causa sin referencia',
        court: caseMap[item.caseId]?.court || 'Juzgado a confirmar',
      })
    ).filter((item) => isCaseVisibleToUser(caseMap[item.caseId], currentUserId));

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
    const caseItem = mockStore.cases.find((item) => String(item.id) === String(data.caseId ?? data.causaId));

    if (!caseItem || !canEditCaseRecord(caseItem, getCurrentAppUserId())) {
      throw createRequestError('No tenes permisos para realizar esta accion.', 403);
    }

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
    const currentUserId = getCurrentAppUserId();
    const items = sortByDateDesc(mockStore.documents, 'uploadedAt').map((item) =>
      normalizeDocument({
        ...item,
        caseTitle: caseMap[item.caseId]?.title || 'Causa sin referencia',
        hearingTitle: hearingMap[item.hearingId]?.title || 'Audiencia sin referencia',
      })
    ).filter((item) => isCaseVisibleToUser(caseMap[item.caseId], currentUserId));

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
    const hearing = mockStore.hearings.find((item) => String(item.id) === String(data.hearingId ?? data.audienciaId));
    const caseItem = mockStore.cases.find((item) => String(item.id) === String(hearing?.caseId));

    if (!hearing || !caseItem || !canEditCaseRecord(caseItem, getCurrentAppUserId())) {
      throw createRequestError('No tenes permisos para realizar esta accion.', 403);
    }

    const nextId = Math.max(0, ...mockStore.documents.map((item) => item.id)) + 1;
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
