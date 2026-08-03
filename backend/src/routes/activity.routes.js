const express = require('express');

const prisma = require('../lib/prisma');
const { activityRateLimit } = require('../lib/rateLimit');
const { requireFirebaseAuth } = require('../middleware/firebaseAuth');

const router = express.Router();
const MAX_PAGE = 10000;
const MAX_LIMIT = 100;
const ACTIVITY_TYPES = new Set(['case', 'document', 'hearing', 'lux', 'transcript']);

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeActivity(item) {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    description: item.description,
    createdAt: item.createdAt,
    relatedEntityType: item.relatedEntityType,
    relatedEntityId: item.relatedEntityId,
    relatedEntityName: item.relatedEntityName,
  };
}

function parsePositiveInteger(value, fallback, maximum, field) {
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

router.use(requireFirebaseAuth);
router.use(activityRateLimit);

router.get('/', async (req, res) => {
  try {
    const requestedType = normalizeOptionalString(req.query?.type);
    if (requestedType && !ACTIVITY_TYPES.has(requestedType)) {
      return res.status(400).json({ success: false, error: 'type no es valido.' });
    }
    const page = parsePositiveInteger(req.query?.page, 1, MAX_PAGE, 'page');
    const limit = parsePositiveInteger(req.query?.limit, 50, MAX_LIMIT, 'limit');
    const data = await prisma.activityLog.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      where: {
        userId: req.authUser.id,
        ...(requestedType ? { type: requestedType } : {}),
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    return res.json({
      success: true,
      data: data.map((item) => normalizeActivity(item)),
    });
  } catch (error) {
    if (error?.status === 400) {
      return res.status(400).json({ success: false, error: error.message });
    }
    console.error('[ACTIVITY] No se pudo cargar el historial.');
    return res.status(500).json({
      success: false,
      error: 'No se pudo cargar el historial de actividad.',
    });
  }
});

module.exports = router;
