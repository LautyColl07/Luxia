function normalizeScopeValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function assertActiveStudyMember(prisma, userId, legalStudyId) {
  const normalizedStudyId = normalizeScopeValue(legalStudyId);

  if (!normalizedStudyId) {
    const error = new Error('legalStudyId es obligatorio para scope=study.');
    error.status = 400;
    throw error;
  }

  const member = await prisma.legalStudyMember.findFirst({
    where: {
      legalStudyId: normalizedStudyId,
      status: 'ACTIVE',
      userId,
    },
  });

  if (!member) {
    const error = new Error('No tenes permisos para acceder a este estudio juridico.');
    error.status = 403;
    throw error;
  }

  return normalizedStudyId;
}

async function getCaseScopeWhere(prisma, req) {
  const userId = req.authUser.id;
  const scope = normalizeScopeValue(req.query?.scope) || 'personal';

  if (scope === 'study') {
    const legalStudyId = await assertActiveStudyMember(prisma, userId, req.query?.legalStudyId);
    return {
      legalStudyId,
    };
  }

  return {
    OR: [
      { createdById: userId },
      { ownerUserId: userId },
      { userId },
    ],
  };
}

async function getRelatedCaseScopeWhere(prisma, req) {
  return {
    case: await getCaseScopeWhere(prisma, req),
  };
}

async function getTranscriptSessionScopeWhere(prisma, req) {
  const userId = req.authUser.id;
  const scope = normalizeScopeValue(req.query?.scope) || 'personal';

  if (scope === 'study') {
    const legalStudyId = await assertActiveStudyMember(prisma, userId, req.query?.legalStudyId);
    return {
      legalStudyId,
    };
  }

  return {
    createdById: userId,
  };
}

function handleScopeError(res, error) {
  if (error?.status === 400 || error?.status === 403) {
    res.status(error.status).json({
      error: error.message,
    });
    return true;
  }

  return false;
}

module.exports = {
  assertActiveStudyMember,
  getCaseScopeWhere,
  getRelatedCaseScopeWhere,
  getTranscriptSessionScopeWhere,
  handleScopeError,
};
