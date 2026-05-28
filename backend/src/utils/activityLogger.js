const prisma = require('../lib/prisma');

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
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
} = {}) {
  const normalizedUserId = normalizeOptionalString(userId);
  const normalizedType = normalizeOptionalString(type);
  const normalizedTitle = normalizeOptionalString(title);
  const normalizedDescription = normalizeOptionalString(description);

  if (!normalizedUserId || !normalizedType || !normalizedTitle || !normalizedDescription) {
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
    console.error('[ACTIVITY_LOGGER] No se pudo registrar actividad:', error?.message || error);
    return null;
  }
}

module.exports = {
  logActivity,
};
