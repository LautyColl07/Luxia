import { request, USE_MOCKS } from './api';

const ACTIVITY_ENDPOINT = '/activity';
const ACTIVITY_TYPES = new Set(['case', 'hearing', 'task', 'document', 'lux', 'transcript']);
const ACTIVITY_PAGE_LIMIT = 100;
const MAX_ACTIVITY_PAGES = 10000;

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

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeActivityPage(payload, requestedPage = 1) {
  if (Array.isArray(payload)) {
    return {
      items: payload,
      page: requestedPage,
      totalPages: 1,
    };
  }

  const items = payload?.items ?? payload?.data ?? payload?.activities;
  if (!Array.isArray(items)) {
    throw new Error('El historial recibido no tiene un formato valido.');
  }

  const page = parsePositiveInteger(payload?.page, requestedPage);
  const totalPages = parsePositiveInteger(payload?.totalPages, 1);

  return { items, page, totalPages };
}

async function getActivityHistoryFromApi() {
  const allItems = [];
  const seenIds = new Set();
  let requestedPage = 1;
  let totalPages = 1;

  do {
    const payload = await request(`${ACTIVITY_ENDPOINT}?page=${requestedPage}&limit=${ACTIVITY_PAGE_LIMIT}`);
    const result = normalizeActivityPage(payload, requestedPage);

    result.items.forEach((item, index) => {
      const normalized = normalizeActivityItem(item, allItems.length + index);
      if (!seenIds.has(normalized.id)) {
        seenIds.add(normalized.id);
        allItems.push(normalized);
      }
    });

    totalPages = Math.min(result.totalPages, MAX_ACTIVITY_PAGES);
    requestedPage += 1;
  } while (requestedPage <= totalPages);

  return normalizeActivityResponse(allItems);
}

export async function getActivityHistory() {
  if (USE_MOCKS) {
    const now = new Date().toISOString();
    return normalizeActivityResponse([
      {
        id: 'demo-activity-case',
        type: 'case',
        title: 'Causa actualizada',
        description: 'Martina actualizo la estrategia y documentacion de la causa.',
        createdAt: now,
        relatedEntityName: 'Gonzalez c/ Lopez',
        relatedEntityId: '101',
      },
      {
        id: 'demo-activity-hearing',
        type: 'hearing',
        title: 'Audiencia programada',
        description: 'Se confirmo una nueva audiencia para esta semana.',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        relatedEntityName: 'Conciliacion con aseguradora',
        relatedEntityId: '202',
      },
    ]);
  }

  return getActivityHistoryFromApi();
}

export { ACTIVITY_ENDPOINT };
