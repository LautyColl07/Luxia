const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const multer = require('multer');
const PDFDocument = require('pdfkit');

const prisma = require('../lib/prisma');
const { requireFirebaseAuth } = require('../middleware/firebaseAuth');
const { transcribeAudioChunk } = require('../services/transcription.service');

const router = express.Router();
const upload = multer({
  limits: {
    fileSize: Number(process.env.HEARING_AUDIO_MAX_BYTES || 200 * 1024 * 1024),
  },
  storage: multer.memoryStorage(),
});
const sseClients = new Map();

const STORAGE_ROOT =
  process.env.LUXIA_STORAGE_ROOT ||
  (process.platform === 'win32' ? path.resolve(process.cwd(), 'storage') : '/opt/luxia/storage');

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function safeId(value, fallback = null) {
  return normalizeOptionalString(value) || fallback;
}

function parseDate(value) {
  const normalized = normalizeOptionalString(value);

  if (!normalized) {
    return null;
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function slugify(value, fallback = 'audiencia') {
  return String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_') || fallback;
}

function ensureInsideStorage(targetPath) {
  const resolvedRoot = path.resolve(STORAGE_ROOT);
  const resolvedTarget = path.resolve(targetPath);

  if (!resolvedTarget.startsWith(resolvedRoot)) {
    throw new Error('Ruta de storage invalida.');
  }

  return resolvedTarget;
}

function getAudioDir(hearingId) {
  return ensureInsideStorage(path.join(STORAGE_ROOT, 'audiencias', String(hearingId), 'audio'));
}

function getPdfDir(hearingId) {
  return ensureInsideStorage(path.join(STORAGE_ROOT, 'audiencias', String(hearingId), 'pdf'));
}

function getChunkDir(hearingId) {
  return ensureInsideStorage(path.join(getAudioDir(hearingId), 'chunks'));
}

function buildDownloadUrl(hearingId, hasPdf) {
  return hasPdf ? `/api/v1/audiencias/${encodeURIComponent(hearingId)}/transcripcion/pdf` : null;
}

function normalizeTranscriptResponse(transcript, hearing) {
  const hasAudio = Boolean(transcript?.audioPath);
  const hasPdf = Boolean(transcript?.pdfPath);

  return {
    transcriptId: transcript?.id || null,
    status: transcript?.status || 'empty',
    text: transcript?.text || '',
    audioAvailable: hasAudio,
    pdfAvailable: hasPdf,
    downloadUrl: buildDownloadUrl(hearing?.id || transcript?.hearingId, hasPdf),
  };
}

function getMetadata(req, hearingId) {
  return {
    hearingId: String(hearingId),
    hearingTitle: normalizeOptionalString(req.body?.hearingTitle || req.body?.title),
    hearingDate: parseDate(req.body?.hearingDate || req.body?.date),
    caseId: safeId(req.body?.caseId || req.body?.causaId, `case-${hearingId}`),
    caseTitle: normalizeOptionalString(req.body?.caseTitle || req.body?.causa || req.body?.caseName) || 'Causa sin referencia',
  };
}

function getUpdateData(values) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

function getDefinedData(values) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined)
  );
}

async function upsertUser(user) {
  return prisma.user.upsert({
    create: {
      email: user.email,
      id: user.id,
      name: user.name,
    },
    update: getUpdateData({
      email: user.email,
      name: user.name,
    }),
    where: { id: user.id },
  });
}

async function getOrCreateHearing(req, { allowCreate }) {
  const user = req.authUser;
  const metadata = getMetadata(req, req.params.id);

  await upsertUser(user);

  const existing = await prisma.hearing.findUnique({
    include: {
      case: true,
      transcripts: {
        where: { userId: user.id },
        take: 1,
      },
    },
    where: { id: metadata.hearingId },
  });

  if (existing) {
    if (existing.userId !== user.id || existing.case?.userId !== user.id) {
      const error = new Error('No tenes permisos para acceder a esta audiencia.');
      error.status = 403;
      throw error;
    }

    const hearingUpdate = getUpdateData({
      date: metadata.hearingDate,
      title: metadata.hearingTitle,
    });
    const caseUpdate = getUpdateData({
      title: metadata.caseTitle,
    });

    if (Object.keys(caseUpdate).length) {
      await prisma.legalCase.update({
        data: caseUpdate,
        where: { id: existing.caseId },
      });
    }

    if (Object.keys(hearingUpdate).length) {
      return prisma.hearing.update({
        data: hearingUpdate,
        include: {
          case: true,
          transcripts: {
            where: { userId: user.id },
            take: 1,
          },
        },
        where: { id: existing.id },
      });
    }

    return existing;
  }

  if (!allowCreate) {
    return null;
  }

  const existingCase = await prisma.legalCase.findUnique({
    where: { id: metadata.caseId },
  });

  if (existingCase && existingCase.userId !== user.id) {
    const error = new Error('No tenes permisos para acceder a esta causa.');
    error.status = 403;
    throw error;
  }

  if (existingCase) {
    await prisma.legalCase.update({
      data: { title: metadata.caseTitle },
      where: { id: metadata.caseId },
    });
  } else {
    await prisma.legalCase.create({
      data: {
        id: metadata.caseId,
        title: metadata.caseTitle,
        userId: user.id,
      },
    });
  }

  return prisma.hearing.create({
    data: {
      caseId: metadata.caseId,
      date: metadata.hearingDate,
      id: metadata.hearingId,
      title: metadata.hearingTitle,
      userId: user.id,
    },
    include: {
      case: true,
      transcripts: {
        where: { userId: user.id },
        take: 1,
      },
    },
  });
}

async function getTranscriptForHearing(hearing, userId) {
  return prisma.transcript.findUnique({
    where: {
      hearingId_userId: {
        hearingId: hearing.id,
        userId,
      },
    },
  });
}

async function upsertTranscript(hearing, userId, data = {}) {
  const updateData = getDefinedData(data);

  return prisma.transcript.upsert({
    create: {
      audioPath: data.audioPath || null,
      caseId: hearing.caseId,
      hearingId: hearing.id,
      pdfPath: data.pdfPath || null,
      status: data.status || 'recording',
      text: data.text || '',
      userId,
    },
    update: updateData,
    where: {
      hearingId_userId: {
        hearingId: hearing.id,
        userId,
      },
    },
  });
}

async function saveAudioFile(hearingId, file, prefix = 'audio') {
  if (!file?.buffer) {
    const error = new Error('El archivo de audio es obligatorio.');
    error.status = 400;
    throw error;
  }

  const extension = path.extname(file.originalname || '') || '.m4a';
  const fileName = `${prefix}_${Date.now()}${extension}`;
  const targetDir = getAudioDir(hearingId);
  const targetPath = ensureInsideStorage(path.join(targetDir, fileName));

  await fsp.mkdir(targetDir, { recursive: true });
  await fsp.writeFile(targetPath, file.buffer);

  return targetPath;
}

async function saveChunkFile(hearingId, file, chunkIndex) {
  const extension = path.extname(file.originalname || '') || '.m4a';
  const fileName = `chunk_${String(chunkIndex).padStart(5, '0')}_${Date.now()}${extension}`;
  const targetDir = getChunkDir(hearingId);
  const targetPath = ensureInsideStorage(path.join(targetDir, fileName));

  await fsp.mkdir(targetDir, { recursive: true });
  await fsp.writeFile(targetPath, file.buffer);

  return targetPath;
}

function buildPdfBuffer({ caseTitle, hearingDate, hearingId, text }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      autoFirstPage: true,
      bufferPages: true,
      info: {
        Author: 'Luxia',
        Subject: `Transcripcion de audiencia ${hearingId}`,
        Title: `Transcripcion Audiencia ${hearingId}`,
      },
      margin: 54,
      size: 'A4',
    });

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .text('Luxia', { align: 'left' })
      .moveDown(0.3)
      .fontSize(15)
      .text('Transcripcion de audiencia');

    doc
      .moveDown()
      .font('Helvetica')
      .fontSize(11)
      .text(`Nombre del caso: ${caseTitle || 'Causa sin referencia'}`)
      .text(`Audiencia: ${hearingId}`)
      .text(`Fecha de audiencia: ${hearingDate ? new Date(hearingDate).toLocaleString('es-AR') : 'Sin fecha'}`)
      .moveDown();

    doc
      .font('Helvetica')
      .fontSize(11)
      .text(String(text || ''), {
        align: 'left',
        lineGap: 4,
      });

    doc
      .moveDown()
      .fontSize(9)
      .fillColor('#666666')
      .text('Generado por Luxia', { align: 'right' });

    doc.end();
  });
}

async function upsertTranscriptPdfFile({ fileName, hearing, pdfPath, userId }) {
  const existing = await prisma.file.findFirst({
    where: {
      documentType: 'transcription_pdf',
      hearingId: hearing.id,
      userId,
    },
  });
  const data = {
    caseId: hearing.caseId,
    documentType: 'transcription_pdf',
    fileName,
    hearingId: hearing.id,
    mimeType: 'application/pdf',
    path: pdfPath,
    userId,
  };

  if (existing) {
    return prisma.file.update({
      data,
      where: { id: existing.id },
    });
  }

  return prisma.file.create({ data });
}

function sendSseEvent(hearingId, userId, payload) {
  const key = `${userId}:${hearingId}`;
  const clients = sseClients.get(key) || new Set();

  clients.forEach((client) => {
    client.write(`data: ${JSON.stringify(payload)}\n\n`);
  });
}

function handleRouteError(res, error, fallbackMessage) {
  const status = error?.status || 500;

  if (status >= 500) {
    console.error('[HEARING_TRANSCRIPTION]', error);
  }

  return res.status(status).json({
    error: error?.message || fallbackMessage,
  });
}

router.use(requireFirebaseAuth);

router.get('/:id/transcripcion', async (req, res) => {
  try {
    const hearing = await getOrCreateHearing(req, { allowCreate: false });

    if (!hearing) {
      return res.json(normalizeTranscriptResponse(null, { id: req.params.id }));
    }

    const transcript = await getTranscriptForHearing(hearing, req.authUser.id);
    return res.json(normalizeTranscriptResponse(transcript, hearing));
  } catch (error) {
    return handleRouteError(res, error, 'No se pudo obtener la transcripcion.');
  }
});

router.post('/:id/audio', upload.single('audio'), async (req, res) => {
  try {
    const hearing = await getOrCreateHearing(req, { allowCreate: true });
    const audioPath = await saveAudioFile(hearing.id, req.file, 'audiencia');
    const transcript = await upsertTranscript(hearing, req.authUser.id, {
      audioPath,
      status: 'recording',
    });

    await prisma.file.create({
      data: {
        caseId: hearing.caseId,
        documentType: 'audio',
        fileName: req.file?.originalname || path.basename(audioPath),
        hearingId: hearing.id,
        mimeType: req.file?.mimetype || 'audio/m4a',
        path: audioPath,
        userId: req.authUser.id,
      },
    });

    return res.status(201).json({
      success: true,
      transcriptId: transcript.id,
      audio: {
        fileName: path.basename(audioPath),
        mimeType: req.file?.mimetype || 'audio/m4a',
      },
    });
  } catch (error) {
    return handleRouteError(res, error, 'No se pudo guardar el audio.');
  }
});

router.post('/:id/transcripcion', async (req, res) => {
  try {
    const hearing = await getOrCreateHearing(req, { allowCreate: false });

    if (!hearing) {
      return res.status(404).json({ error: 'No encontramos la audiencia solicitada.' });
    }

    const currentTranscript = await getTranscriptForHearing(hearing, req.authUser.id);

    if (!currentTranscript?.audioPath) {
      return res.status(400).json({ error: 'La audiencia no tiene audio asociado para transcribir.' });
    }

    await upsertTranscript(hearing, req.authUser.id, { status: 'transcribing' });

    const audioBuffer = await fsp.readFile(currentTranscript.audioPath);
    const text = await transcribeAudioChunk({
      buffer: audioBuffer,
      mimetype: 'audio/m4a',
      originalname: path.basename(currentTranscript.audioPath),
    });
    const transcript = await upsertTranscript(hearing, req.authUser.id, {
      status: 'completed',
      text,
    });

    return res.json({
      ...normalizeTranscriptResponse(transcript, hearing),
      success: true,
    });
  } catch (error) {
    if (req.params?.id) {
      const hearing = await prisma.hearing.findUnique({ where: { id: String(req.params.id) } }).catch(() => null);

      if (hearing?.userId === req.authUser?.id) {
        await upsertTranscript(hearing, req.authUser.id, { status: 'failed' }).catch(() => null);
      }
    }

    return handleRouteError(res, error, 'No se pudo transcribir el audio.');
  }
});

router.post('/:id/transcripcion/live/start', async (req, res) => {
  try {
    const hearing = await getOrCreateHearing(req, { allowCreate: true });
    const transcript = await upsertTranscript(hearing, req.authUser.id, {
      status: 'recording',
      text: req.body?.reset === false ? undefined : '',
    });

    sendSseEvent(hearing.id, req.authUser.id, {
      status: transcript.status,
      text: transcript.text,
      type: 'started',
    });

    return res.status(201).json(normalizeTranscriptResponse(transcript, hearing));
  } catch (error) {
    return handleRouteError(res, error, 'No se pudo iniciar la transcripcion en vivo.');
  }
});

router.post('/:id/transcripcion/live/chunk', upload.single('audio'), async (req, res) => {
  try {
    const hearing = await getOrCreateHearing(req, { allowCreate: true });
    const chunkIndex = Number(req.body?.chunkIndex || 0);
    const chunkPath = await saveChunkFile(hearing.id, req.file, Number.isFinite(chunkIndex) ? chunkIndex : 0);
    const text = await transcribeAudioChunk(req.file);
    const currentTranscript = await getTranscriptForHearing(hearing, req.authUser.id);
    const fullText = [currentTranscript?.text, text].filter(Boolean).join('\n');
    const transcript = await upsertTranscript(hearing, req.authUser.id, {
      audioPath: getChunkDir(hearing.id),
      status: 'transcribing',
      text: fullText,
    });

    sendSseEvent(hearing.id, req.authUser.id, {
      chunkIndex,
      fullText,
      status: transcript.status,
      text,
      type: 'partial',
    });

    return res.json({
      chunkIndex,
      chunkFileName: path.basename(chunkPath),
      fullText,
      status: transcript.status,
      text,
    });
  } catch (error) {
    return handleRouteError(res, error, 'No se pudo procesar el segmento de audio.');
  }
});

router.post('/:id/transcripcion/live/finish', async (req, res) => {
  try {
    const hearing = await getOrCreateHearing(req, { allowCreate: false });

    if (!hearing) {
      return res.status(404).json({ error: 'No encontramos la audiencia solicitada.' });
    }

    const chunkDir = getChunkDir(hearing.id);
    const manifestPath = ensureInsideStorage(path.join(getAudioDir(hearing.id), 'chunks_manifest.json'));
    let chunks = [];

    try {
      chunks = (await fsp.readdir(chunkDir)).filter((fileName) => fileName.startsWith('chunk_')).sort();
      await fsp.writeFile(manifestPath, JSON.stringify({ chunks, generatedAt: new Date().toISOString() }, null, 2));
    } catch {
      chunks = [];
    }

    const transcript = await upsertTranscript(hearing, req.authUser.id, {
      audioPath: chunks.length ? manifestPath : undefined,
      status: 'completed',
    });

    sendSseEvent(hearing.id, req.authUser.id, {
      status: transcript.status,
      text: transcript.text,
      type: 'finished',
    });

    return res.json(normalizeTranscriptResponse(transcript, hearing));
  } catch (error) {
    return handleRouteError(res, error, 'No se pudo finalizar la transcripcion en vivo.');
  }
});

router.get('/:id/transcripcion/live/events', async (req, res) => {
  try {
    const hearing = await getOrCreateHearing(req, { allowCreate: false });

    if (!hearing) {
      return res.status(404).json({ error: 'No encontramos la audiencia solicitada.' });
    }

    const key = `${req.authUser.id}:${hearing.id}`;
    const clients = sseClients.get(key) || new Set();

    sseClients.set(key, clients);
    clients.add(res);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write('event: ready\n');
    res.write('data: {"type":"ready"}\n\n');

    req.on('close', () => {
      clients.delete(res);

      if (!clients.size) {
        sseClients.delete(key);
      }
    });
  } catch (error) {
    return handleRouteError(res, error, 'No se pudo abrir el canal de transcripcion.');
  }
});

router.post('/:id/transcripcion/pdf', async (req, res) => {
  try {
    const hearing = await getOrCreateHearing(req, { allowCreate: false });

    if (!hearing) {
      return res.status(404).json({ error: 'No encontramos la audiencia solicitada.' });
    }

    const transcript = await getTranscriptForHearing(hearing, req.authUser.id);
    const text = normalizeOptionalString(transcript?.text);

    if (!text) {
      return res.status(400).json({ error: 'No hay transcripcion para guardar.' });
    }

    const targetDir = getPdfDir(hearing.id);
    const fileName = `Transcripcion_${slugify(hearing.case?.title || 'Causa')}_Audiencia_${slugify(hearing.id)}.pdf`;
    const pdfPath = ensureInsideStorage(path.join(targetDir, fileName));
    const pdfBuffer = await buildPdfBuffer({
      caseTitle: hearing.case?.title,
      hearingDate: hearing.date,
      hearingId: hearing.id,
      text,
    });

    await fsp.mkdir(targetDir, { recursive: true });
    await fsp.writeFile(pdfPath, pdfBuffer);

    const updated = await upsertTranscript(hearing, req.authUser.id, {
      pdfPath,
      status: 'completed',
    });
    const document = await upsertTranscriptPdfFile({
      fileName,
      hearing,
      pdfPath,
      userId: req.authUser.id,
    });

    return res.status(201).json({
      ...normalizeTranscriptResponse(updated, hearing),
      downloadUrl: buildDownloadUrl(hearing.id, true),
      document: {
        id: document.id,
        caseId: document.caseId,
        documentType: document.documentType,
        fileName: document.fileName,
        hearingId: document.hearingId,
        mimeType: document.mimeType,
        path: buildDownloadUrl(hearing.id, true),
      },
      success: true,
    });
  } catch (error) {
    return handleRouteError(res, error, 'No se pudo generar el PDF.');
  }
});

router.get('/:id/transcripcion/pdf', async (req, res) => {
  try {
    const hearing = await getOrCreateHearing(req, { allowCreate: false });

    if (!hearing) {
      return res.status(404).json({ error: 'No encontramos la audiencia solicitada.' });
    }

    const transcript = await getTranscriptForHearing(hearing, req.authUser.id);

    if (!transcript?.pdfPath) {
      return res.status(404).json({ error: 'La transcripcion todavia no tiene PDF generado.' });
    }

    await fsp.access(transcript.pdfPath, fs.constants.R_OK);
    return res.download(transcript.pdfPath, path.basename(transcript.pdfPath));
  } catch (error) {
    return handleRouteError(res, error, 'No se pudo descargar el PDF.');
  }
});

module.exports = router;
