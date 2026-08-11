const express = require('express');

const prisma = require('../lib/prisma');
const { requireFirebaseAuth } = require('../middleware/firebaseAuth');
const { getCaseScopeWhere, handleScopeError } = require('../lib/studyScope');

const router = express.Router();

function getTodayRange(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function normalizeUpcomingHearing(hearing) {
  return {
    id: hearing.id,
    title: hearing.title || 'Audiencia sin titulo',
    date: hearing.date,
    caseId: hearing.caseId,
    caseTitle: hearing.case?.title || 'Causa sin referencia',
    court: hearing.case?.court || null,
  };
}

async function getDashboardSummary({ prismaClient = prisma, req, now = new Date() }) {
  const caseScopeWhere = await getCaseScopeWhere(prismaClient, req);
  const { start, end } = getTodayRange(now);
  const hearingsWhere = { case: caseScopeWhere };

  const [activeCases, hearingsToday, documents, upcomingHearings] = await Promise.all([
    prismaClient.legalCase.count({ where: { ...caseScopeWhere, status: 'active' } }),
    prismaClient.hearing.count({
      where: { ...hearingsWhere, date: { gte: start, lt: end } },
    }),
    prismaClient.file.count({ where: { case: caseScopeWhere } }),
    prismaClient.hearing.findMany({
      where: { ...hearingsWhere, date: { gte: now } },
      include: { case: true },
      orderBy: { date: 'asc' },
      take: 5,
    }),
  ]);

  return {
    usuario: {
      id: req.authUser.id,
      email: req.authUser.email,
      name: req.authUser.name || null,
    },
    metricas: {
      causasActivas: activeCases,
      audienciasHoy: hearingsToday,
      documentos: documents,
      tareasPendientes: 0,
    },
    proximasAudiencias: upcomingHearings.map(normalizeUpcomingHearing),
  };
}

router.use(requireFirebaseAuth);

router.get('/resumen', async (req, res) => {
  try {
    return res.json(await getDashboardSummary({ req }));
  } catch (error) {
    if (handleScopeError(res, error)) return undefined;
    console.error('[DASHBOARD] No se pudo cargar el resumen.');
    return res.status(500).json({ error: 'No se pudo cargar el panel principal.' });
  }
});

module.exports = router;
module.exports.__testables = {
  getDashboardSummary,
  getTodayRange,
  normalizeUpcomingHearing,
};
