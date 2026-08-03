const prisma = require('../lib/prisma');

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim();
  return normalized || null;
}

async function logActivity({
  userId,
  userEmail,
  userName,
  type,
  title,
  description,
  relatedEntityType,
  relatedEntityId,
  relatedEntityName,
  required = false,
} = {}) {
  const normalizedUserId = normalizeOptionalString(userId);
  const normalizedType = normalizeOptionalString(type);
  const normalizedTitle = normalizeOptionalString(title);
  const normalizedDescription = normalizeOptionalString(description);

  if (!normalizedUserId || !normalizedType || !normalizedTitle || !normalizedDescription) {
    if (required) {
      const error = new Error('No se pudo registrar la actividad.');
      error.status = 500;
      throw error;
    }
    return null;
  }

  try {
    await prisma.user.upsert({
      create: {
        id: normalizedUserId,
        email: normalizeOptionalString(userEmail),
        name: normalizeOptionalString(userName),
      },
      update: {
        email: normalizeOptionalString(userEmail) || undefined,
        name: normalizeOptionalString(userName) || undefined,
      },
      where: {
        id: normalizedUserId,
      },
    });

    return await prisma.activityLog.create({
      data: {
        userId: normalizedUserId,
        type: normalizedType,
        title: normalizedTitle,
        description: normalizedDescription,
        relatedEntityType: normalizeOptionalString(relatedEntityType),
        relatedEntityId: normalizeOptionalString(relatedEntityId),
        relatedEntityName: normalizeOptionalString(relatedEntityName),
      },
    });
  } catch (error) {
    console.error('[ACTIVITY_LOGGER] No se pudo registrar actividad.');
    if (required) {
      const persistenceError = new Error('No se pudo registrar la actividad.');
      persistenceError.status = 500;
      throw persistenceError;
    }
    return null;
  }
}

module.exports = {
  logActivity,
};
