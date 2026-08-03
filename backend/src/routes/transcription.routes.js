const express = require('express');

const prisma = require('../lib/prisma');
const { validateAudioFile } = require('../lib/fileValidation');
const { createUpload, removeTemporaryUpload } = require('../lib/upload');
const { transcriptionRateLimit } = require('../lib/rateLimit');
const { getTranscriptSessionScopeWhere, handleScopeError } = require('../lib/studyScope');
const { requireFirebaseAuth } = require('../middleware/firebaseAuth');
const { transcribeAudioChunk } = require('../services/transcription.service');
const { logActivity } = require('../utils/activityLogger');

const router = express.Router();
const MAX_ID_LENGTH = 191;
const MAX_TITLE_LENGTH = 191;
const upload = createUpload({
  limits: {
    fieldNameSize: 100,
    fieldSize: 16 * 1024,
    fileSize: Number(process.env.TRANSCRIPTION_CHUNK_MAX_BYTES || 50 * 1024 * 1024),
    files: 1,
    fields: 8,
    parts: 10,
  },
});

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function validateOptionalString(value, field, maxLength) {
  const normalized = normalizeOptionalString(value);

  if (normalized && normalized.length > maxLength) {
    const error = new Error(`${field} supera la longitud permitida.`);
    error.status = 400;
    throw error;
  }

  return normalized;
}

function normalizeSession(session) {
  if (!session) {
    return null;
  }

  const chunks = Array.isArray(session.chunks)
    ? [...session.chunks]
      .sort((first, second) => first.chunkIndex - second.chunkIndex)
      .map((chunk) => ({
        chunkIndex: chunk.chunkIndex,
        createdAt: chunk.createdAt,
        endTime: chunk.endTime,
        id: chunk.id,
        startTime: chunk.startTime,
        text: chunk.text,
      }))
    : [];

  return {
    caseId: session.caseId,
    chunks,
    createdAt: session.createdAt,
    hearingId: session.hearingId,
    id: session.id,
    status: session.status,
    title: session.title,
    transcript: chunks.map((chunk) => chunk.text).filter(Boolean).join('\n'),
    updatedAt: session.updatedAt,
  };
}

async function getAuthorizedSession(req, sessionId, includeChunks = false) {
  const normalizedSessionId = validateOptionalString(sessionId, 'sessionId', MAX_ID_LENGTH);

  if (!normalizedSessionId) {
    const error = new Error('sessionId es obligatorio.');
    error.status = 400;
    throw error;
  }

  const scopeWhere = await getTranscriptSessionScopeWhere(prisma, req);

  return prisma.transcriptSession.findFirst({
    ...(includeChunks
      ? {
        include: {
          chunks: {
            orderBy: { chunkIndex: 'asc' },
          },
        },
      }
      : {}),
    where: {
      id: normalizedSessionId,
      ...scopeWhere,
    },
  });
}

function sendRouteError(res, error, fallbackMessage) {
  if (handleScopeError(res, error)) {
    return;
  }

  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500;

  if (status >= 500) {
    console.error('[TRANSCRIPTION] No se pudo procesar la solicitud.');
  }

  return res.status(status).json({
    error: status < 500 ? error.message : fallbackMessage,
  });
}

router.use(requireFirebaseAuth);
router.use(transcriptionRateLimit);

router.post('/start', async (req, res) => {
  try {
    const scopeWhere = await getTranscriptSessionScopeWhere(prisma, req);
    const session = await prisma.transcriptSession.create({
      data: {
        caseId: validateOptionalString(req.body?.caseId, 'caseId', MAX_ID_LENGTH),
        createdById: req.authUser.id,
        hearingId: validateOptionalString(req.body?.hearingId, 'hearingId', MAX_ID_LENGTH),
        ...(scopeWhere.legalStudyId ? { legalStudyId: scopeWhere.legalStudyId } : {}),
        title: validateOptionalString(req.body?.title, 'title', MAX_TITLE_LENGTH),
      },
    });

    return res.status(201).json({
      sessionId: session.id,
    });
  } catch (error) {
    return sendRouteError(res, error, 'No se pudo crear la sesion de transcripcion.');
  }
});

router.post('/:sessionId/chunk', upload.single('audio'), async (req, res) => {
  const chunkIndex = normalizeNumber(req.body?.chunkIndex);
  const startTime = normalizeNumber(req.body?.startTime);
  const endTime = normalizeNumber(req.body?.endTime);

  if (!req.file) {
    return res.status(400).json({ error: 'El archivo audio es obligatorio.' });
  }

  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    return res.status(400).json({ error: 'chunkIndex debe ser un entero mayor o igual a 0.' });
  }

  try {
    await validateAudioFile(req.file);
    const session = await getAuthorizedSession(req, req.params.sessionId);

    if (!session) {
      return res.status(404).json({ error: 'No encontramos la sesion de transcripcion.' });
    }

    const text = await transcribeAudioChunk(req.file);
    const chunk = await prisma.transcriptChunk.upsert({
      create: {
        chunkIndex,
        endTime,
        sessionId: session.id,
        startTime,
        text,
      },
      update: {
        endTime,
        startTime,
        text,
      },
      where: {
        sessionId_chunkIndex: {
          chunkIndex,
          sessionId: session.id,
        },
      },
    });

    return res.json({
      chunkIndex: chunk.chunkIndex,
      endTime: chunk.endTime,
      startTime: chunk.startTime,
      text: chunk.text,
    });
  } catch (error) {
    return sendRouteError(res, error, 'No se pudo transcribir y guardar el bloque de audio.');
  } finally {
    await removeTemporaryUpload(req.file);
  }
});

router.post('/:sessionId/finish', async (req, res) => {
  try {
    const session = await getAuthorizedSession(req, req.params.sessionId, true);

    if (!session) {
      return res.status(404).json({ error: 'No encontramos la sesion de transcripcion.' });
    }

    const updated = await prisma.transcriptSession.update({
      data: { status: 'finished' },
      include: {
        chunks: {
          orderBy: { chunkIndex: 'asc' },
        },
      },
      where: { id: session.id },
    });

    await logActivity({
      userId: req.authUser.id,
      type: 'transcript',
      title: 'Transcripcion guardada',
      description: `Se guardo la transcripcion ${updated.title ? `de ${updated.title}` : 'de una sesion en vivo'}.`,
      relatedEntityType: 'transcript_session',
      relatedEntityId: updated.id,
      relatedEntityName: updated.title || updated.hearingId || updated.id,
    });

    return res.json(normalizeSession(updated));
  } catch (error) {
    return sendRouteError(res, error, 'No se pudo finalizar la sesion de transcripcion.');
  }
});

router.get('/:sessionId', async (req, res) => {
  try {
    const session = await getAuthorizedSession(req, req.params.sessionId, true);

    if (!session) {
      return res.status(404).json({ error: 'No encontramos la sesion de transcripcion.' });
    }

    return res.json(normalizeSession(session));
  } catch (error) {
    return sendRouteError(res, error, 'No se pudo obtener la sesion de transcripcion.');
  }
});

router.use((error, req, res, next) => {
  if (error?.name === 'MulterError') {
    void removeTemporaryUpload(req.file);
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ error: 'El archivo de audio no cumple los limites permitidos.' });
  }

  if (error) {
    return res.status(500).json({ error: 'No se pudo procesar la solicitud de transcripcion.' });
  }

  return next();
});

module.exports = router;
