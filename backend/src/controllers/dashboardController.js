const { CaseScope, MemberStatus } = require('@prisma/client');

const prisma = require('../lib/prisma');

async function getDashboardSummary(req, res, next) {
  try {
    const memberships = await prisma.legalStudyMember.findMany({
      where: {
        userId: req.user.id,
        status: MemberStatus.ACTIVE,
        legalStudy: {
          deletedAt: null,
        },
      },
      select: {
        legalStudyId: true,
      },
    });

    const legalStudyIds = memberships.map((item) => item.legalStudyId);
    const visibleCases = await prisma.case.findMany({
      where: {
        deletedAt: null,
        OR: [
          {
            scope: CaseScope.PRIVATE,
            createdById: req.user.id,
          },
          {
            scope: CaseScope.LEGAL_STUDY,
            legalStudyId: {
              in: legalStudyIds.length ? legalStudyIds : ['__none__'],
            },
          },
        ],
      },
    });

    return res.json({
      usuario: req.user,
      metricas: {
        causasActivas: visibleCases.length,
        audienciasHoy: 0,
        documentos: 0,
        tareasPendientes: 0,
      },
      proximasAudiencias: [],
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDashboardSummary,
};
