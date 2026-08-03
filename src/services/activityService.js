import { request } from './api';

const ACTIVITY_ENDPOINT = '/activity';
const ACTIVITY_TYPES = new Set(['case', 'hearing', 'task', 'document', 'lux', 'transcript']);

function normalizeDateValue(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toOptionalString(value) {
  if (typeof value !== 'string') {
    return value ? String(value) : undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

export function normalizeActivityItem(item = {}, index = 0) {
  const normalizedType = ACTIVITY_TYPES.has(item?.type) ? item.type : 'case';

  return {
    id: toOptionalString(item?.id) || `activity-${index}`,
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
    .map((item, index) => normalizeActivityItem(item, index))
    .sort((first, second) => {
      const firstTime = first.createdAt ? new Date(first.createdAt).getTime() : 0;
      const secondTime = second.createdAt ? new Date(second.createdAt).getTime() : 0;
      return secondTime - firstTime;
    });
}

async function getActivityHistoryFromApi() {
  const payload = await request(ACTIVITY_ENDPOINT);
  const items = Array.isArray(payload)
    ? payload
    : payload?.data ?? payload?.activities ?? payload?.items;

  return normalizeActivityResponse(Array.isArray(items) ? items : []);
}

export async function getActivityHistory() {
  return getActivityHistoryFromApi();
}

export { ACTIVITY_ENDPOINT };
