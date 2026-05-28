import { request } from './api';

const VALID_TYPES = new Set(['case', 'hearing', 'task', 'document', 'lux', 'transcript']);

function toOptionalString(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized || undefined;
}

function normalizeDateValue(value) {
  if (!value) {
    return new Date().toISOString();
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function normalizeActivityItem(item = {}) {
  const normalizedType = VALID_TYPES.has(item?.type) ? item.type : 'case';

  return {
    id: toOptionalString(item?.id) || `activity-${Date.now()}`,
    type: normalizedType,
    title: toOptionalString(item?.title) || 'Movimiento registrado',
    description:
      toOptionalString(item?.description) || 'Se registro una actividad reciente en el estudio.',
    createdAt: normalizeDateValue(item?.createdAt),
    relatedEntityType: toOptionalString(item?.relatedEntityType),
    relatedEntityId: toOptionalString(item?.relatedEntityId),
    relatedEntityName: toOptionalString(item?.relatedEntityName),
  };
}

export function normalizeActivityResponse(items = []) {
  return [...items]
    .map((item) => normalizeActivityItem(item))
    .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime());
}

export async function getActivityHistory({ type } = {}) {
  const normalizedType = toOptionalString(type);
  const query = normalizedType ? `?type=${encodeURIComponent(normalizedType)}` : '';
  const payload = await request(`/activity${query}`);
  const items = Array.isArray(payload) ? payload : payload?.data ?? payload?.items ?? [];

  return normalizeActivityResponse(Array.isArray(items) ? items : []);
}
