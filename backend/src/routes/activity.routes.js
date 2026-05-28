const express = require('express');

const prisma = require('../lib/prisma');
const { requireFirebaseAuth } = require('../middleware/firebaseAuth');

const router = express.Router();

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

router.use(requireFirebaseAuth);

router.get('/', async (req, res) => {
  try {
    const requestedType = normalizeOptionalString(req.query?.type);
    const data = await prisma.activityLog.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      where: {
        userId: req.authUser.id,
        ...(requestedType ? { type: requestedType } : {}),
      },
    });

    return res.json({
      success: true,
      data: data.map((item) => normalizeActivity(item)),
    });
  } catch (error) {
    console.error('[ACTIVITY] Error obteniendo historial:', error);
    return res.status(500).json({
      success: false,
      error: 'No se pudo cargar el historial de actividad.',
    });
  }
});

module.exports = router;
