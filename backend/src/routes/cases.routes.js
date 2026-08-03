const crypto = require('crypto');
const express = require('express');

const prisma = require('../lib/prisma');
const { searchRateLimit } = require('../lib/rateLimit');
const { requireFirebaseAuth } = require('../middleware/firebaseAuth');
const { assertActiveStudyMember, getCaseScopeWhere, handleScopeError } = require('../lib/studyScope');
const { logActivity } = require('../utils/activityLogger');

const router = express.Router();
const MAX_ID_LENGTH = 191;
const MAX_PAGE = 10000;
const MAX_QUERY_LENGTH = 120;
const MAX_TEXT_LENGTH = 500;
const MAX_LIMIT = 100;
const CASE_STATUS_ALIASES = new Map([
  ['pending', 'pending'],
  ['pendiente', 'pending'],
  ['active', 'active'],
  ['activa', 'active'],
  ['enproceso', 'active'],
  ['closed', 'closed'],
  ['cerrada', 'closed'],
  ['finalizada', 'closed'],
  ['archived', 'archived'],
  ['archivada', 'archived'],
]);

function normalizeOptionalString(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeStatusKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

function normalizeCaseStatus(value, { required = false } = {}) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    if (required) {
      const error = new Error('status es obligatorio.');
      error.status = 400;
      throw error;
    }
    return undefined;
  }

  const status = CASE_STATUS_ALIASES.get(normalizeStatusKey(normalized));
  if (!status) {
    const error = new Error('status no es valido.');
    error.status = 400;
    throw error;
  }

  return status;
}

function validateCaseId(value) {
  const id = normalizeOptionalString(value);
  if (!id || id.length > MAX_ID_LENGTH || !/^[A-Za-z0-9_-]+$/.test(id)) {
    const error = new Error('El identificador de la causa no es valido.');
    error.status = 400;
    throw error;
  }
  return id;
}

function optionalQueryString(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > MAX_QUERY_LENGTH) {
    const error = new Error(`${field} no es valido.`);
    error.status = 400;
    throw error;
  }
  return value.trim();
}

function optionalText(value, field, { required = false } = {}) {
  const text = normalizeOptionalString(value);
  if (!text && required) {
    const error = new Error(`${field} es obligatorio.`);
    error.status = 400;
    throw error;
  }
  if (text && text.length > MAX_TEXT_LENGTH) {
    const error = new Error(`${field} supera la longitud permitida.`);
    error.status = 400;
    throw error;
  }
  return text || undefined;
}

function optionalDate(value, field) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error(`${field} no es valida.`);
    error.status = 400;
    throw error;
  }
  return date;
}

function positiveInteger(value, fallback, maximum, field) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    const error = new Error(`${field} no es valido.`);
    error.status = 400;
    throw error;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    const error = new Error(`${field} no es valido.`);
    error.status = 400;
    throw error;
  }
  return parsed;
}

function normalizeRequestedScope(value) {
  const scope = normalizeStatusKey(value);
  if (!scope || scope === 'personal' || scope === 'private') return 'personal';
  if (scope === 'study' || scope === 'legalstudy') return 'study';
  const error = new Error('scope no es valido.');
  error.status = 400;
  throw error;
}

function normalizeCaseResponse(legalCase) {
  return {
    id: legalCase.id,
    title: legalCase.title,
    status: legalCase.status,
    court: legalCase.court,
    createdAt: legalCase.createdAt,
    updatedAt: legalCase.updatedAt,
    legalStudyId: legalCase.legalStudyId || null,
    ...(legalCase.hearings ? { hearings: legalCase.hearings } : {}),
    ...(legalCase.files ? { documents: legalCase.files } : {}),
  };
}

async function upsertUser(user, prismaClient = prisma) {
  return prismaClient.user.upsert({
    create: { id: user.id, email: user.email, name: user.name },
    update: { email: user.email || undefined, name: user.name || undefined },
    where: { id: user.id },
  });
}

async function getCreationScope(prismaClient, user, body) {
  const scope = normalizeRequestedScope(body?.scope);
  if (scope === 'personal') return null;
  return assertActiveStudyMember(prismaClient, user.id, body?.legalStudyId);
}

async function createCaseForUser({ prismaClient = prisma, user, body, activityLogger = logActivity }) {
  const title = optionalText(body?.title ?? body?.titulo ?? body?.caratula, 'title', { required: true });
  const court = optionalText(body?.court ?? body?.juzgado, 'court');
  const status = normalizeCaseStatus(body?.status ?? body?.estado) || 'pending';
  const legalStudyId = await getCreationScope(prismaClient, user, body);

  await upsertUser(user, prismaClient);
  const created = await prismaClient.legalCase.create({
    data: {
      id: crypto.randomUUID(),
      title,
      status,
      court: court || null,
      userId: user.id,
      createdById: user.id,
      ownerUserId: user.id,
      legalStudyId,
    },
  });

  await activityLogger({
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    type: 'case',
    title: 'Causa creada',
    description: 'Se registro una causa.',
    relatedEntityType: 'case',
    relatedEntityId: created.id,
    relatedEntityName: created.title,
  });

  return created;
}

function buildListWhere(scopeWhere, query) {
  const where = { ...scopeWhere };
  const status = normalizeCaseStatus(optionalQueryString(query?.status, 'status'));
  const court = optionalQueryString(query?.court, 'court');
  const search = optionalQueryString(query?.search, 'search');
  const startDate = optionalDate(query?.startDate, 'startDate');
  const endDate = optionalDate(query?.endDate, 'endDate');

  if (status) where.status = status;
  if (court) where.court = { contains: court };
  if (search) where.title = { contains: search };
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = startDate;
    if (endDate) {
      endDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = endDate;
    }
  }
  return where;
}

router.use(requireFirebaseAuth);
router.use(searchRateLimit);

router.get('/', async (req, res) => {
  try {
    const page = positiveInteger(req.query?.page, 1, MAX_PAGE, 'page');
    const limit = positiveInteger(req.query?.limit, 20, MAX_LIMIT, 'limit');
    const scopeWhere = await getCaseScopeWhere(prisma, req);
    const where = buildListWhere(scopeWhere, req.query);
    const [total, items] = await Promise.all([
      prisma.legalCase.count({ where }),
      prisma.legalCase.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return res.json({
      items: items.map(normalizeCaseResponse),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    if (handleScopeError(res, error)) return undefined;
    if (error?.status === 400) return res.status(400).json({ error: error.message });
    console.error('[CASES_ROUTES] No se pudieron cargar las causas.');
    return res.status(500).json({ error: 'No pudimos cargar las causas registradas.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const created = await createCaseForUser({ user: req.authUser, body: req.body });

    return res.status(201).json(normalizeCaseResponse(created));
  } catch (error) {
    if (handleScopeError(res, error)) return undefined;
    if (error?.status === 400) return res.status(400).json({ error: error.message });
    console.error('[CASES_ROUTES] No se pudo crear la causa.');
    return res.status(500).json({ error: 'No pudimos registrar la causa.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = validateCaseId(req.params.id);
    const scopeWhere = await getCaseScopeWhere(prisma, req);
    const legalCase = await prisma.legalCase.findFirst({
      where: { id, ...scopeWhere },
      include: {
        hearings: { orderBy: { date: 'asc' }, include: { files: true } },
        files: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!legalCase) return res.status(404).json({ error: 'No encontramos la causa solicitada.' });
    return res.json(normalizeCaseResponse(legalCase));
  } catch (error) {
    if (handleScopeError(res, error)) return undefined;
    if (error?.status === 400) return res.status(400).json({ error: error.message });
    console.error('[CASES_ROUTES] No se pudo cargar la causa.');
    return res.status(500).json({ error: 'No pudimos cargar la causa solicitada.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = validateCaseId(req.params.id);
    const scopeWhere = await getCaseScopeWhere(prisma, req);
    const current = await prisma.legalCase.findFirst({ where: { id, ...scopeWhere } });
    if (!current) return res.status(404).json({ error: 'No encontramos la causa solicitada.' });

    const title = optionalText(req.body?.title ?? req.body?.titulo ?? req.body?.caratula, 'title');
    const court = optionalText(req.body?.court ?? req.body?.juzgado, 'court');
    const status = normalizeCaseStatus(req.body?.status ?? req.body?.estado);
    const data = {
      ...(title ? { title } : {}),
      ...(court !== undefined ? { court: court || null } : {}),
      ...(status ? { status } : {}),
    };
    if (!Object.keys(data).length) return res.status(400).json({ error: 'No hay campos validos para actualizar.' });

    const updated = await prisma.legalCase.update({ where: { id: current.id }, data });
    return res.json(normalizeCaseResponse(updated));
  } catch (error) {
    if (handleScopeError(res, error)) return undefined;
    if (error?.status === 400) return res.status(400).json({ error: error.message });
    console.error('[CASES_ROUTES] No se pudo actualizar la causa.');
    return res.status(500).json({ error: 'No pudimos actualizar la causa.' });
  }
});

module.exports = router;
module.exports.__testables = {
  buildListWhere,
  createCaseForUser,
  normalizeCaseStatus,
  normalizeRequestedScope,
  validateCaseId,
};
