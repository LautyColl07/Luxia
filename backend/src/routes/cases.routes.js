const express = require('express');
const prisma = require('../lib/prisma');
const { requireFirebaseAuth } = require('../middleware/firebaseAuth');

const router = express.Router();

router.use(requireFirebaseAuth);

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

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (pageNumber - 1) * limitNumber;

    // Base query conditions: User must own the case or be associated with it.
    // In LegalCase, userId is the primary owner, but we should match userId.
    const where = {
      userId: req.authUser.id,
    };

    if (status && status !== 'all') {
      where.status = status;
    }

    if (court) {
      where.court = {
        contains: court,
      };
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        // Include the entire end day
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (search) {
      where.title = {
        contains: search,
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
    console.error('[CASES_ROUTES] Error fetching cases:', error);
    res.status(500).json({ error: 'No pudimos cargar las causas registradas.' });
  }
});

module.exports = router;
