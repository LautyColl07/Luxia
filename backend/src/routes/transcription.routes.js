const express = require('express');
const multer = require('multer');

const prisma = require('../lib/prisma');
const { requireFirebaseAuth } = require('../middleware/firebaseAuth');
const { transcribeAudioChunk } = require('../services/transcription.service');

const router = express.Router();
const upload = multer({
  limits: {
    fileSize: Number(process.env.TRANSCRIPTION_CHUNK_MAX_BYTES || 50 * 1024 * 1024),
  },
  storage: multer.memoryStorage(),
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

function getBearerUserId(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const [, payload] = token.split('.');

  if (!payload) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return normalizeOptionalString(decoded.user_id || decoded.sub || decoded.uid);
  } catch {
    return null;
  }
}

function normalizeSession(session) {
  if (!session) {
    return null;
  }

  const chunks = Array.isArray(session.chunks)
    ? [...session.chunks].sort((first, second) => first.chunkIndex - second.chunkIndex)
    : [];

  return {
    ...session,
    chunks,
    transcript: chunks.map((chunk) => chunk.text).filter(Boolean).join('\n'),
  };
}

router.post('/start', async (req, res) => {
  const { caseId, hearingId, title } = req.body || {};

  console.log('[TRANSCRIPTION] start session');

  try {
    const session = await prisma.transcriptSession.create({
      data: {
        caseId: normalizeOptionalString(caseId),
        hearingId: normalizeOptionalString(hearingId),
        title: normalizeOptionalString(title),
        createdById: getBearerUserId(req),
      },
    });

    return res.status(201).json({
      sessionId: session.id,
    });
  } catch (error) {
    console.error('[TRANSCRIPTION] Error creando sesion:', error);
    return res.status(500).json({
      error: 'No se pudo crear la sesion de transcripcion.',
    });
  }
});

router.post('/:sessionId/chunk', upload.single('audio'), async (req, res) => {
  const { sessionId } = req.params;
  const chunkIndex = normalizeNumber(req.body?.chunkIndex);
  const startTime = normalizeNumber(req.body?.startTime);
  const endTime = normalizeNumber(req.body?.endTime);

  console.log('[TRANSCRIPTION] received chunk');

  if (!req.file) {
    return res.status(400).json({
      error: 'El archivo audio es obligatorio.',
    });
  }

  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    return res.status(400).json({
      error: 'chunkIndex debe ser un entero mayor o igual a 0.',
    });
  }

  try {
    const session = await prisma.transcriptSession.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true },
    });

    if (!session) {
      return res.status(404).json({
        error: 'No encontramos la sesion de transcripcion.',
      });
    }

    const text = await transcribeAudioChunk(req.file);

    const chunk = await prisma.transcriptChunk.upsert({
      create: {
        chunkIndex,
        endTime,
        sessionId,
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
          sessionId,
        },
      },
    });

    console.log('[TRANSCRIPTION] chunk saved');

    return res.json({
      chunkIndex: chunk.chunkIndex,
      endTime: chunk.endTime,
      startTime: chunk.startTime,
      text: chunk.text,
    });
  } catch (error) {
    console.error('[TRANSCRIPTION] Error procesando chunk:', error);
    return res.status(500).json({
      error: 'No se pudo transcribir y guardar el bloque de audio.',
    });
  }
});

router.post('/:sessionId/finish', async (req, res) => {
  const { sessionId } = req.params;

  console.log('[TRANSCRIPTION] finish session');

  try {
    const session = await prisma.transcriptSession.update({
      data: { status: 'finished' },
      include: {
        chunks: {
          orderBy: { chunkIndex: 'asc' },
        },
      },
      where: { id: sessionId },
    });

    return res.json(normalizeSession(session));
  } catch (error) {
    if (error?.code === 'P2025') {
      return res.status(404).json({
        error: 'No encontramos la sesion de transcripcion.',
      });
    }

    console.error('[TRANSCRIPTION] Error finalizando sesion:', error);
    return res.status(500).json({
      error: 'No se pudo finalizar la sesion de transcripcion.',
    });
  }
});

router.post('/:id/transcripcion/pdf', requireFirebaseAuth, async (req, res) => {
  const hearingId = normalizeOptionalString(req.params.id);

  if (!hearingId) {
    return res.status(400).json({
      error: 'hearingId es obligatorio.',
    });
  }

  return res.json({
    success: true,
    message: 'PDF pendiente de implementación',
    downloadUrl: null,
  });
});

router.get('/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  try {
    const session = await prisma.transcriptSession.findUnique({
      include: {
        chunks: {
          orderBy: { chunkIndex: 'asc' },
        },
      },
      where: { id: sessionId },
    });

    if (!session) {
      return res.status(404).json({
        error: 'No encontramos la sesion de transcripcion.',
      });
    }

    return res.json(normalizeSession(session));
  } catch (error) {
    console.error('[TRANSCRIPTION] Error obteniendo sesion:', error);
    return res.status(500).json({
      error: 'No se pudo obtener la sesion de transcripcion.',
    });
  }
});

module.exports = router;
