import { API_BASE_URL } from '../config/api';
import { auth } from '../config/firebase';
import mockActivity from '../data/mockActivity';

const ACTIVITY_ENDPOINT = '/activity';
const USE_ACTIVITY_MOCKS = false;
const ACTIVITY_TYPES = new Set(['case', 'hearing', 'task', 'document', 'lux', 'transcript']);

function simulateDelay(result, ms = 320) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(result), ms);
  });
}

function normalizeDateValue(value) {
  if (!value) {
    return new Date().toISOString();
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function toOptionalString(value) {
  if (typeof value !== 'string') {
    return value ? String(value) : undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

export function normalizeActivityItem(item = {}) {
  const normalizedType = ACTIVITY_TYPES.has(item?.type) ? item.type : 'case';

  return {
    id: toOptionalString(item?.id) || `activity-${Date.now()}`,
    type: normalizedType,
    title: toOptionalString(item?.title) || 'Movimiento registrado',
    description:
      toOptionalString(item?.description) || 'Se registro una actividad reciente en el estudio.',
    createdAt: normalizeDateValue(item?.createdAt),
    relatedEntityType: toOptionalString(item?.relatedEntityType),
    relatedEntityName: toOptionalString(item?.relatedEntityName),
    relatedEntityId: toOptionalString(item?.relatedEntityId),
  };
}

export function normalizeActivityResponse(items = []) {
  return [...items]
    .map((item) => normalizeActivityItem(item))
    .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime());
}

async function getActivityHistoryFromApi() {
  if (!API_BASE_URL) {
    throw new Error('Configura API_BASE_URL para consultar el historial de actividad.');
  }

  const headers = {
    Accept: 'application/json',
  };

  const currentUser = auth?.currentUser;

  if (currentUser) {
    const token = await currentUser.getIdToken();

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE_URL}${ACTIVITY_ENDPOINT}`, {
    method: 'GET',
    headers,
  });

  const payload = await response.json().catch(() => []);

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      'No pudimos obtener el historial de actividad en este momento.';

    throw new Error(message);
  }

  const items = Array.isArray(payload) ? payload : payload?.data ?? payload?.items;
  return normalizeActivityResponse(Array.isArray(items) ? items : []);
}

export async function getActivityHistory(options = {}) {
  const useMockData = options.useMockData ?? USE_ACTIVITY_MOCKS;
  const fallbackToMock = options.fallbackToMock ?? false;

  if (useMockData) {
    return simulateDelay(normalizeActivityResponse(mockActivity));
  }

  try {
    return await getActivityHistoryFromApi();
  } catch (error) {
    if (!fallbackToMock) {
      throw error;
    }

    return simulateDelay(normalizeActivityResponse(mockActivity));
  }
}

export { ACTIVITY_ENDPOINT, USE_ACTIVITY_MOCKS };
