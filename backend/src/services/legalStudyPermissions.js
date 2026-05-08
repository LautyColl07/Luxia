const { CaseScope, LegalStudyRole, MemberStatus } = require('@prisma/client');

const prisma = require('../lib/prisma');
const { forbidden, notFound } = require('../utils/httpErrors');

async function getLegalStudyOrThrow(legalStudyId) {
  const legalStudy = await prisma.legalStudy.findFirst({
    where: {
      id: legalStudyId,
      deletedAt: null,
    },
  });

  if (!legalStudy) {
    throw notFound('Estudio Juridico no encontrado.');
  }

  return legalStudy;
}

async function getActiveMembership(userId, legalStudyId) {
  return prisma.legalStudyMember.findFirst({
    where: {
      userId,
      legalStudyId,
      status: MemberStatus.ACTIVE,
      legalStudy: {
        deletedAt: null,
      },
    },
  });
}

async function getMembershipOrThrow(userId, legalStudyId) {
  await getLegalStudyOrThrow(legalStudyId);
  const membership = await getActiveMembership(userId, legalStudyId);

  if (!membership) {
    throw forbidden();
  }

  return membership;
}

async function canViewLegalStudy(userId, legalStudyId) {
  return Boolean(await getActiveMembership(userId, legalStudyId));
}

async function canManageLegalStudy(userId, legalStudyId) {
  const membership = await getActiveMembership(userId, legalStudyId);
  return membership?.role === LegalStudyRole.OWNER || membership?.role === LegalStudyRole.ADMIN;
}

async function canInviteMembers(userId, legalStudyId) {
  return canManageLegalStudy(userId, legalStudyId);
}

async function canCreateStudyCase(userId, legalStudyId) {
  const membership = await getActiveMembership(userId, legalStudyId);
  return (
    membership?.role === LegalStudyRole.OWNER ||
    membership?.role === LegalStudyRole.ADMIN ||
    membership?.role === LegalStudyRole.MEMBER
  );
}

async function getCaseAccessContext(userId, caseId) {
  const caseItem = await prisma.case.findFirst({
    where: {
      id: caseId,
      deletedAt: null,
    },
    include: {
      legalStudy: true,
    },
  });

  if (!caseItem) {
    throw notFound('No encontramos la causa solicitada.');
  }

  if (caseItem.scope === CaseScope.PRIVATE) {
    const canView = caseItem.createdById === userId;

    if (!canView) {
      throw forbidden();
    }

    return {
      caseItem,
      membership: null,
      canView: true,
      canEdit: caseItem.createdById === userId,
      canDelete: caseItem.createdById === userId,
      isReadOnly: false,
      currentUserRole: null,
    };
  }

  const membership = await getActiveMembership(userId, caseItem.legalStudyId);

  if (!membership) {
    throw forbidden();
  }

  const isManager =
    membership.role === LegalStudyRole.OWNER || membership.role === LegalStudyRole.ADMIN;
  const isCreatorMember =
    membership.role === LegalStudyRole.MEMBER && caseItem.createdById === userId;

  return {
    caseItem,
    membership,
    canView: true,
    canEdit: isManager || isCreatorMember,
    canDelete: isManager || isCreatorMember,
    isReadOnly: membership.role === LegalStudyRole.VIEWER,
    currentUserRole: membership.role,
  };
}

async function canEditStudyCase(userId, caseId) {
  const context = await getCaseAccessContext(userId, caseId);
  return context.canEdit;
}

async function canDeleteStudyCase(userId, caseId) {
  const context = await getCaseAccessContext(userId, caseId);
  return context.canDelete;
}

async function countActiveOwners(legalStudyId) {
  return prisma.legalStudyMember.count({
    where: {
      legalStudyId,
      status: MemberStatus.ACTIVE,
      role: LegalStudyRole.OWNER,
    },
  });
}

module.exports = {
  countActiveOwners,
  getLegalStudyOrThrow,
  getActiveMembership,
  getMembershipOrThrow,
  getCaseAccessContext,
  canViewLegalStudy,
  canManageLegalStudy,
  canInviteMembers,
  canCreateStudyCase,
  canEditStudyCase,
  canDeleteStudyCase,
};
