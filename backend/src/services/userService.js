const prisma = require('../lib/prisma');
const { badRequest } = require('../utils/httpErrors');

function getDisplayNameFromEmail(email) {
  return String(email || '')
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .trim();
}

async function ensureUserFromFirebase(decodedToken) {
  const firebaseUid = decodedToken?.uid;
  const email = String(decodedToken?.email || '').trim().toLowerCase();

  if (!firebaseUid || !email) {
    throw badRequest('El token de Firebase no incluye la informacion necesaria del usuario.');
  }

  const displayName = String(decodedToken?.name || '').trim() || getDisplayNameFromEmail(email) || null;

  const userByUid = await prisma.user.findUnique({
    where: { firebaseUid },
  });

  if (userByUid) {
    return prisma.user.update({
      where: { id: userByUid.id },
      data: {
        email,
        displayName,
      },
    });
  }

  const userByEmail = await prisma.user.findUnique({
    where: { email },
  });

  if (userByEmail) {
    return prisma.user.update({
      where: { id: userByEmail.id },
      data: {
        firebaseUid,
        displayName,
      },
    });
  }

  return prisma.user.create({
    data: {
      firebaseUid,
      email,
      displayName,
    },
  });
}

async function findOrCreatePendingUserByEmail(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedEmail) {
    throw badRequest('Datos invalidos.');
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    return existingUser;
  }

  return prisma.user.create({
    data: {
      email: normalizedEmail,
      displayName: getDisplayNameFromEmail(normalizedEmail) || null,
    },
  });
}

module.exports = {
  ensureUserFromFirebase,
  findOrCreatePendingUserByEmail,
};
