const express = require('express');
const prisma = require('../lib/prisma');
const { searchRateLimit } = require('../lib/rateLimit');
const { requireFirebaseAuth } = require('../middleware/firebaseAuth');

const router = express.Router();
const MAX_PAGE = 10000;
const MAX_QUERY_LENGTH = 120;

function optionalQueryString(value, field) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string' || value.trim().length > MAX_QUERY_LENGTH) {
    const error = new Error(`${field} no es valido.`);
    error.status = 400;
    throw error;
  }

  return value.trim();
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

router.use(requireFirebaseAuth);
router.use(searchRateLimit);

router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      court, 
      startDate, 
      endDate, 
      search 
    } = req.query;

    const pageNumber = Math.min(MAX_PAGE, Math.max(1, parseInt(page, 10) || 1));
    const limitNumber = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (pageNumber - 1) * limitNumber;

    // Base query conditions: User must own the case or be associated with it.
    // In LegalCase, userId is the primary owner, but we should match userId.
    const where = {
      userId: req.authUser.id,
    };

    const normalizedStatus = optionalQueryString(status, 'status');
    const normalizedCourt = optionalQueryString(court, 'court');
    const normalizedSearch = optionalQueryString(search, 'search');
    if (normalizedStatus && normalizedStatus !== 'all') {
      where.status = normalizedStatus;
    }

    if (normalizedCourt) {
      where.court = {
        contains: normalizedCourt,
      };
    }

    if (startDate || endDate) {
      where.createdAt = {};
      const normalizedStartDate = optionalDate(startDate, 'startDate');
      const normalizedEndDate = optionalDate(endDate, 'endDate');
      if (normalizedStartDate) {
        where.createdAt.gte = normalizedStartDate;
      }
      if (normalizedEndDate) {
        // Include the entire end day
        const end = normalizedEndDate;
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (normalizedSearch) {
      where.title = {
        contains: normalizedSearch,
      };
    }

    const [total, items] = await Promise.all([
      prisma.legalCase.count({ where }),
      prisma.legalCase.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limitNumber,
      })
    ]);

    res.json({
      items,
      total,
      page: pageNumber,
      limit: limitNumber,
      totalPages: Math.ceil(total / limitNumber),
    });
  } catch (error) {
    if (error?.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    console.error('[CASES_ROUTES] No se pudieron cargar las causas.');
    res.status(500).json({ error: 'No pudimos cargar las causas registradas.' });
  }
});

module.exports = router;
