const express = require('express');

const prisma = require('../lib/prisma');
const { requireFirebaseAuth } = require('../middleware/firebaseAuth');

const router = express.Router();
const MAX_STUDY_NAME_LENGTH = 160;

function normalizeStudyName(value) {
  if (typeof value !== 'string') {
    const error = new Error('El nombre del estudio juridico es obligatorio.');
    error.status = 400;
    throw error;
  }

  const name = value.trim().replace(/\s+/g, ' ');
  if (!name || name.length > MAX_STUDY_NAME_LENGTH) {
    const error = new Error(`El nombre del estudio debe tener entre 1 y ${MAX_STUDY_NAME_LENGTH} caracteres.`);
    error.status = 400;
    throw error;
  }

  return name;
}

async function upsertUser(user, prismaClient = prisma) {
  return prismaClient.user.upsert({
    create: { id: user.id, email: user.email, name: user.name },
    update: { email: user.email || undefined, name: user.name || undefined },
    where: { id: user.id },
  });
}

function toStudyOption(member) {
  return {
    id: member.legalStudy.id,
    name: member.legalStudy.name,
  };
}

async function getStudiesForUser(prismaClient, userId) {
  const memberships = await prismaClient.legalStudyMember.findMany({
    where: { userId, status: 'ACTIVE' },
    include: { legalStudy: true },
    orderBy: { updatedAt: 'desc' },
  });

  return memberships.map(toStudyOption);
}

async function createStudyForUser(prismaClient, user, rawName) {
  const name = normalizeStudyName(rawName);
  await upsertUser(user, prismaClient);

  const existing = await prismaClient.legalStudyMember.findFirst({
    where: {
      userId: user.id,
      status: 'ACTIVE',
      legalStudy: { name },
    },
    include: { legalStudy: true },
  });

  if (existing) {
    return toStudyOption(existing);
  }

  // El nombre no es una credencial: nunca se agrega a alguien a un estudio
  // existente solo por conocerlo. La incorporacion de terceros requiere una
  // invitacion autenticada, que se implementara como flujo separado.
  const study = await prismaClient.legalStudy.create({
    data: {
      name,
      members: {
        create: {
          userId: user.id,
          status: 'ACTIVE',
        },
      },
    },
  });

  return { id: study.id, name: study.name };
}

router.use(requireFirebaseAuth);

router.get('/my', async (req, res) => {
  try {
    await upsertUser(req.authUser);
    return res.json({ data: await getStudiesForUser(prisma, req.authUser.id) });
  } catch (error) {
    console.error('[LEGAL_STUDIES] No se pudieron cargar los estudios.');
    return res.status(500).json({ error: 'No se pudieron cargar los estudios juridicos.' });
  }
});

router.post('/join', async (req, res) => {
  try {
    const study = await createStudyForUser(prisma, req.authUser, req.body?.name);
    return res.status(201).json(study);
  } catch (error) {
    if (error?.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    console.error('[LEGAL_STUDIES] No se pudo crear el estudio.');
    return res.status(500).json({ error: 'No se pudo crear el estudio juridico.' });
  }
});

module.exports = router;
module.exports.__testables = {
  createStudyForUser,
  getStudiesForUser,
  normalizeStudyName,
};
