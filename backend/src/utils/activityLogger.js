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
    return;
  }

  try {
    await prisma.$executeRaw`
      INSERT INTO ActivityLog (
        id,
        userId,
        type,
        title,
        description,
        relatedEntityType,
        relatedEntityId,
        relatedEntityName,
        createdAt
      ) VALUES (
        UUID(),
        ${normalizedUserId},
        ${normalizedType},
        ${normalizedTitle},
        ${normalizedDescription},
        ${normalizeOptionalString(relatedEntityType)},
        ${normalizeOptionalString(relatedEntityId)},
        ${normalizeOptionalString(relatedEntityName)},
        NOW()
      )
    `;
  } catch (error) {
    console.error('[ACTIVITY_LOGGER] No se pudo registrar actividad:', error?.message || error);
  }
}

module.exports = {
  logActivity,
};
