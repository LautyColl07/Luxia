const { CaseScope, MemberStatus } = require('@prisma/client');

const prisma = require('../lib/prisma');
const {
  canCreateStudyCase,
  getActiveMembership,
  getCaseAccessContext,
} = require('../services/legalStudyPermissions');
const { badRequest, forbidden } = require('../utils/httpErrors');

function serializeCase(caseItem, access = {}) {
  return {
    id: caseItem.id,
    title: caseItem.title,
    description: caseItem.description,
    court: caseItem.court,
    status: caseItem.status,
    scope: caseItem.scope,
    ownerUserId: caseItem.ownerUserId || String(caseItem.createdById),
    createdById: caseItem.createdById,
    legalStudyId: caseItem.legalStudyId,
    legalStudy: caseItem.legalStudy
      ? {
          id: caseItem.legalStudy.id,
          name: caseItem.legalStudy.name,
        }
      : null,
    legalStudyName: caseItem.legalStudy?.name || null,
    currentUserRole: access.currentUserRole || null,
    permissions: {
      canView: true,
      canEdit: Boolean(access.canEdit),
      canDelete: Boolean(access.canDelete),
      isReadOnly: Boolean(access.isReadOnly),
    },
    createdAt: caseItem.createdAt,
    updatedAt: caseItem.updatedAt,
  };
}

async function listCases(req, res, next) {
  try {
    const requestedScope = String(req.query.scope || 'all').toLowerCase();
    const legalStudyId = String(req.query.legalStudyId || '').trim() || null;
    const memberships = await prisma.legalStudyMember.findMany({
      where: {
        userId: req.user.id,
        status: MemberStatus.ACTIVE,
        legalStudy: {
          deletedAt: null,
        },
      },
    });
    const activeStudyIds = memberships.map((item) => item.legalStudyId);

    let whereClause = {
      deletedAt: null,
    };

    if (requestedScope === 'private') {
      whereClause = {
        ...whereClause,
        scope: CaseScope.PRIVATE,
        createdById: req.user.id,
      };
    } else if (requestedScope === 'legal_study') {
      if (!legalStudyId) {
        throw badRequest('Datos invalidos.');
      }

      if (!activeStudyIds.includes(legalStudyId)) {
        throw forbidden();
      }

      whereClause = {
        ...whereClause,
        scope: CaseScope.LEGAL_STUDY,
        legalStudyId,
      };
    } else {
      whereClause = {
        ...whereClause,
        OR: [
          {
            scope: CaseScope.PRIVATE,
            createdById: req.user.id,
          },
          {
            scope: CaseScope.LEGAL_STUDY,
            legalStudyId: {
              in: activeStudyIds.length ? activeStudyIds : ['__none__'],
            },
          },
        ],
      };
    }

    const cases = await prisma.case.findMany({
      where: whereClause,
      include: {
        legalStudy: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const response = await Promise.all(
      cases.map(async (caseItem) => {
        const access =
          caseItem.scope === CaseScope.PRIVATE
            ? { canEdit: caseItem.createdById === req.user.id, canDelete: caseItem.createdById === req.user.id }
            : (() => {
                const membership = memberships.find((item) => item.legalStudyId === caseItem.legalStudyId);
                const isManager = membership?.role === 'OWNER' || membership?.role === 'ADMIN';
                const isCreatorMember = membership?.role === 'MEMBER' && caseItem.createdById === req.user.id;

                return {
                  currentUserRole: membership?.role || null,
                  isReadOnly: membership?.role === 'VIEWER',
                  canEdit: isManager || isCreatorMember,
                  canDelete: isManager || isCreatorMember,
                };
              })();

        return serializeCase(caseItem, access);
      })
    );

    return res.json(response);
  } catch (error) {
    next(error);
  }
}

async function getCaseById(req, res, next) {
  try {
    const access = await getCaseAccessContext(req.user.id, Number(req.params.id));
    return res.json(serializeCase(access.caseItem, access));
  } catch (error) {
    next(error);
  }
}

async function createCase(req, res, next) {
  try {
    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim() || null;
    const court = String(req.body.court || '').trim() || null;
    const status = String(req.body.status || 'Activa').trim() || 'Activa';
    const scope = req.body.scope === CaseScope.LEGAL_STUDY ? CaseScope.LEGAL_STUDY : CaseScope.PRIVATE;
    const legalStudyId = String(req.body.legalStudyId || '').trim() || null;

    if (!title) {
      throw badRequest('Datos invalidos.');
    }

    if (scope === CaseScope.LEGAL_STUDY) {
      if (!legalStudyId) {
        throw badRequest('Datos invalidos.');
      }

      const allowed = await canCreateStudyCase(req.user.id, legalStudyId);

      if (!allowed) {
        throw forbidden();
      }
    }

    const createdCase = await prisma.case.create({
      data: {
        title,
        description,
        court,
        status,
        scope,
        createdById: req.user.id,
        ownerUserId: String(req.user.id),
        legalStudyId: scope === CaseScope.LEGAL_STUDY ? legalStudyId : null,
      },
      include: {
        legalStudy: true,
      },
    });

    const membership = legalStudyId ? await getActiveMembership(req.user.id, legalStudyId) : null;
    return res.status(201).json(
      serializeCase(createdCase, {
        currentUserRole: membership?.role || null,
        isReadOnly: false,
        canEdit: true,
        canDelete: true,
      })
    );
  } catch (error) {
    next(error);
  }
}

async function updateCase(req, res, next) {
  try {
    const caseId = Number(req.params.id);
    const access = await getCaseAccessContext(req.user.id, caseId);

    if (!access.canEdit) {
      throw forbidden();
    }

    const title = String(req.body.title || access.caseItem.title).trim();
    const description = req.body.description === undefined ? access.caseItem.description : String(req.body.description || '').trim() || null;
    const court = req.body.court === undefined ? access.caseItem.court : String(req.body.court || '').trim() || null;
    const status = req.body.status === undefined ? access.caseItem.status : String(req.body.status || '').trim() || access.caseItem.status;
    const nextScope = req.body.scope === CaseScope.LEGAL_STUDY ? CaseScope.LEGAL_STUDY : req.body.scope === CaseScope.PRIVATE ? CaseScope.PRIVATE : access.caseItem.scope;
    const nextLegalStudyId =
      nextScope === CaseScope.LEGAL_STUDY
        ? String(req.body.legalStudyId || access.caseItem.legalStudyId || '').trim()
        : null;

    if (!title) {
      throw badRequest('Datos invalidos.');
    }

    if (nextScope === CaseScope.LEGAL_STUDY) {
      if (!nextLegalStudyId) {
        throw badRequest('Datos invalidos.');
      }

      const allowed = await canCreateStudyCase(req.user.id, nextLegalStudyId);

      if (!allowed) {
        throw forbidden();
      }
    }

    const updatedCase = await prisma.case.update({
      where: {
        id: caseId,
      },
      data: {
        title,
        description,
        court,
        status,
        scope: nextScope,
        legalStudyId: nextLegalStudyId,
      },
      include: {
        legalStudy: true,
      },
    });

    const membership = updatedCase.legalStudyId
      ? await getActiveMembership(req.user.id, updatedCase.legalStudyId)
      : null;

    return res.json(
      serializeCase(updatedCase, {
        currentUserRole: membership?.role || null,
        isReadOnly: membership?.role === 'VIEWER',
        canEdit: true,
        canDelete: true,
      })
    );
  } catch (error) {
    next(error);
  }
}

async function deleteCase(req, res, next) {
  try {
    const caseId = Number(req.params.id);
    const access = await getCaseAccessContext(req.user.id, caseId);

    if (!access.canDelete) {
      throw forbidden();
    }

    await prisma.case.update({
      where: {
        id: caseId,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listCases,
  getCaseById,
  createCase,
  updateCase,
  deleteCase,
};
