const { LegalStudyRole, MemberStatus } = require('@prisma/client');

const prisma = require('../lib/prisma');
const {
  countActiveOwners,
  getLegalStudyOrThrow,
  getMembershipOrThrow,
} = require('../services/legalStudyPermissions');
const { findOrCreatePendingUserByEmail } = require('../services/userService');
const { badRequest, conflict, forbidden, notFound } = require('../utils/httpErrors');

function serializeMember(member) {
  return {
    id: member.id,
    userId: member.userId,
    legalStudyId: member.legalStudyId,
    role: member.role,
    status: member.status,
    user: member.user,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
  };
}

function serializeLegalStudy(legalStudy, currentMembership) {
  return {
    id: legalStudy.id,
    name: legalStudy.name,
    description: legalStudy.description,
    ownerId: legalStudy.ownerId,
    owner: legalStudy.owner,
    members: Array.isArray(legalStudy.members) ? legalStudy.members.map(serializeMember) : undefined,
    currentMembership: currentMembership ? serializeMember(currentMembership) : undefined,
    createdAt: legalStudy.createdAt,
    updatedAt: legalStudy.updatedAt,
  };
}

async function createLegalStudy(req, res, next) {
  try {
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim() || null;

    if (!name) {
      throw badRequest('Datos invalidos.');
    }

    const legalStudy = await prisma.$transaction(async (transaction) => {
      const createdLegalStudy = await transaction.legalStudy.create({
        data: {
          name,
          description,
          ownerId: req.user.id,
        },
        include: {
          owner: true,
        },
      });

      const membership = await transaction.legalStudyMember.create({
        data: {
          userId: req.user.id,
          legalStudyId: createdLegalStudy.id,
          role: LegalStudyRole.OWNER,
          status: MemberStatus.ACTIVE,
        },
        include: {
          user: true,
        },
      });

      return {
        ...createdLegalStudy,
        currentMembership: membership,
      };
    });

    return res.status(201).json(serializeLegalStudy(legalStudy, legalStudy.currentMembership));
  } catch (error) {
    next(error);
  }
}

async function listMyLegalStudies(req, res, next) {
  try {
    const memberships = await prisma.legalStudyMember.findMany({
      where: {
        userId: req.user.id,
        status: MemberStatus.ACTIVE,
        legalStudy: {
          deletedAt: null,
        },
      },
      include: {
        user: true,
        legalStudy: {
          include: {
            owner: true,
            members: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    return res.json(
      memberships.map((membership) =>
        serializeLegalStudy(membership.legalStudy, membership)
      )
    );
  } catch (error) {
    next(error);
  }
}

async function getLegalStudyById(req, res, next) {
  try {
    const legalStudyId = String(req.params.id || '').trim();
    const membership = await getMembershipOrThrow(req.user.id, legalStudyId);
    const legalStudy = await prisma.legalStudy.findFirst({
      where: {
        id: legalStudyId,
        deletedAt: null,
      },
      include: {
        owner: true,
        members: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!legalStudy) {
      throw notFound('Estudio Juridico no encontrado.');
    }

    return res.json(serializeLegalStudy(legalStudy, membership));
  } catch (error) {
    next(error);
  }
}

async function updateLegalStudy(req, res, next) {
  try {
    const legalStudyId = String(req.params.id || '').trim();
    const membership = await getMembershipOrThrow(req.user.id, legalStudyId);

    if (![LegalStudyRole.OWNER, LegalStudyRole.ADMIN].includes(membership.role)) {
      throw forbidden();
    }

    const name = String(req.body.name || '').trim();
    const description = req.body.description === undefined ? undefined : String(req.body.description || '').trim() || null;

    const updatedLegalStudy = await prisma.legalStudy.update({
      where: {
        id: legalStudyId,
      },
      data: {
        ...(name ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
      },
      include: {
        owner: true,
        members: {
          include: {
            user: true,
          },
        },
      },
    });

    return res.json(serializeLegalStudy(updatedLegalStudy, membership));
  } catch (error) {
    next(error);
  }
}

async function deleteLegalStudy(req, res, next) {
  try {
    const legalStudyId = String(req.params.id || '').trim();
    const membership = await getMembershipOrThrow(req.user.id, legalStudyId);

    if (membership.role !== LegalStudyRole.OWNER) {
      throw forbidden();
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.legalStudy.update({
        where: {
          id: legalStudyId,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      await transaction.legalStudyMember.updateMany({
        where: {
          legalStudyId,
        },
        data: {
          status: MemberStatus.REMOVED,
        },
      });
    });

    return res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function addMember(req, res, next) {
  try {
    const legalStudyId = String(req.params.id || '').trim();
    const managerMembership = await getMembershipOrThrow(req.user.id, legalStudyId);

    if (![LegalStudyRole.OWNER, LegalStudyRole.ADMIN].includes(managerMembership.role)) {
      throw forbidden();
    }

    const email = String(req.body.email || '').trim().toLowerCase();
    const role =
      req.body.role && Object.values(LegalStudyRole).includes(req.body.role)
        ? req.body.role
        : LegalStudyRole.MEMBER;

    if (!email || role === LegalStudyRole.OWNER) {
      throw badRequest('Datos invalidos.');
    }

    await getLegalStudyOrThrow(legalStudyId);
    const user = await findOrCreatePendingUserByEmail(email);
    const existingMembership = await prisma.legalStudyMember.findUnique({
      where: {
        userId_legalStudyId: {
          userId: user.id,
          legalStudyId,
        },
      },
      include: {
        user: true,
      },
    });

    if (existingMembership && existingMembership.status !== MemberStatus.REMOVED) {
      throw conflict('El usuario ya pertenece a este Estudio Juridico.');
    }

    const membership = existingMembership
      ? await prisma.legalStudyMember.update({
          where: {
            id: existingMembership.id,
          },
          data: {
            role,
            status: user.firebaseUid ? MemberStatus.ACTIVE : MemberStatus.PENDING,
          },
          include: {
            user: true,
          },
        })
      : await prisma.legalStudyMember.create({
          data: {
            userId: user.id,
            legalStudyId,
            role,
            status: user.firebaseUid ? MemberStatus.ACTIVE : MemberStatus.PENDING,
          },
          include: {
            user: true,
          },
        });

    return res.status(201).json(serializeMember(membership));
  } catch (error) {
    next(error);
  }
}

async function listMembers(req, res, next) {
  try {
    const legalStudyId = String(req.params.id || '').trim();
    await getMembershipOrThrow(req.user.id, legalStudyId);
    const members = await prisma.legalStudyMember.findMany({
      where: {
        legalStudyId,
        legalStudy: {
          deletedAt: null,
        },
      },
      include: {
        user: true,
      },
      orderBy: [
        { role: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    return res.json(members.map(serializeMember));
  } catch (error) {
    next(error);
  }
}

async function updateMember(req, res, next) {
  try {
    const legalStudyId = String(req.params.id || '').trim();
    const memberId = String(req.params.memberId || '').trim();
    const managerMembership = await getMembershipOrThrow(req.user.id, legalStudyId);

    if (!memberId) {
      throw badRequest('Datos invalidos.');
    }

    const targetMember = await prisma.legalStudyMember.findFirst({
      where: {
        id: memberId,
        legalStudyId,
      },
      include: {
        user: true,
      },
    });

    if (!targetMember) {
      throw notFound('Miembro no encontrado.');
    }

    if (managerMembership.role === LegalStudyRole.ADMIN) {
      if (![LegalStudyRole.MEMBER, LegalStudyRole.VIEWER].includes(targetMember.role)) {
        throw forbidden();
      }
    } else if (managerMembership.role !== LegalStudyRole.OWNER) {
      throw forbidden();
    }

    const nextRole =
      req.body.role && Object.values(LegalStudyRole).includes(req.body.role)
        ? req.body.role
        : targetMember.role;
    const nextStatus =
      req.body.status && Object.values(MemberStatus).includes(req.body.status)
        ? req.body.status
        : targetMember.status;

    if (targetMember.role === LegalStudyRole.OWNER) {
      throw forbidden();
    }

    if (nextRole === LegalStudyRole.OWNER) {
      throw forbidden();
    }

    if (targetMember.userId === req.user.id && nextStatus !== MemberStatus.ACTIVE) {
      const activeOwners = await countActiveOwners(legalStudyId);

      if (managerMembership.role === LegalStudyRole.OWNER && activeOwners <= 1) {
        throw forbidden('El OWNER no puede eliminarse a si mismo si es el unico OWNER.');
      }
    }

    const updatedMember = await prisma.legalStudyMember.update({
      where: {
        id: targetMember.id,
      },
      data: {
        role: nextRole,
        status: nextStatus,
      },
      include: {
        user: true,
      },
    });

    return res.json(serializeMember(updatedMember));
  } catch (error) {
    next(error);
  }
}

async function deleteMember(req, res, next) {
  try {
    const legalStudyId = String(req.params.id || '').trim();
    const memberId = String(req.params.memberId || '').trim();
    const managerMembership = await getMembershipOrThrow(req.user.id, legalStudyId);

    if (!memberId) {
      throw badRequest('Datos invalidos.');
    }

    const targetMember = await prisma.legalStudyMember.findFirst({
      where: {
        id: memberId,
        legalStudyId,
      },
    });

    if (!targetMember) {
      throw notFound('Miembro no encontrado.');
    }

    if (managerMembership.role === LegalStudyRole.ADMIN) {
      if (![LegalStudyRole.MEMBER, LegalStudyRole.VIEWER].includes(targetMember.role)) {
        throw forbidden();
      }
    } else if (managerMembership.role !== LegalStudyRole.OWNER) {
      throw forbidden();
    }

    if (targetMember.role === LegalStudyRole.OWNER) {
      const activeOwners = await countActiveOwners(legalStudyId);

      if (activeOwners <= 1) {
        throw forbidden('El OWNER no puede eliminarse a si mismo si es el unico OWNER.');
      }
    }

    await prisma.legalStudyMember.update({
      where: {
        id: targetMember.id,
      },
      data: {
        status: MemberStatus.REMOVED,
      },
    });

    return res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createLegalStudy,
  listMyLegalStudies,
  getLegalStudyById,
  updateLegalStudy,
  deleteLegalStudy,
  addMember,
  listMembers,
  updateMember,
  deleteMember,
};
