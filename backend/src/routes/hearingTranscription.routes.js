const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');

const prisma = require('../lib/prisma');
const { transcriptionRateLimit } = require('../lib/rateLimit');
const { validateAudioFile } = require('../lib/fileValidation');
const { STORAGE_ROOT, createUpload, ensureInsideStorage, removeTemporaryUpload } = require('../lib/upload');
const { requireFirebaseAuth } = require('../middleware/firebaseAuth');
const { getCaseScopeWhere, handleScopeError } = require('../lib/studyScope');
const { transcribeAudioChunk } = require('../services/transcription.service');
const { logActivity } = require('../utils/activityLogger');

const router = express.Router();
const upload = createUpload({
  limits: {
    fieldNameSize: 100,
    fieldSize: 16 * 1024,
    fileSize: Number(process.env.HEARING_AUDIO_MAX_BYTES || 200 * 1024 * 1024),
    files: 1,
    fields: 12,
    parts: 14,
  },
});
const sseClients = new Map();
const MAX_ID_LENGTH = 191;
const MAX_TEXT_LENGTH = 500;
const MAX_PAGE = 10000;
const MAX_LIMIT = 100;

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function safeId(value, fallback = null) {
  const id = normalizeOptionalString(value) || fallback;
  if (!id || id.length > MAX_ID_LENGTH || !/^[A-Za-z0-9_-]+$/.test(id)) {
    const error = new Error('El identificador no es valido.');
    error.status = 400;
    throw error;
  }
  return id;
}

function safeText(value, field) {
  const text = normalizeOptionalString(value);
  if (text && text.length > MAX_TEXT_LENGTH) {
    const error = new Error(`${field} supera la longitud permitida.`);
    error.status = 400;
    throw error;
  }
  return text;
}

function parseDate(value) {
  const normalized = normalizeOptionalString(value);

  if (!normalized) {
    return null;
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function requiredDate(value, field) {
  const date = parseDate(value);
  if (!date) {
    const error = new Error(`${field} es obligatoria y debe ser valida.`);
    error.status = 400;
    throw error;
  }
  return date;
}

function parsePositiveInteger(value, fallback, maximum, field) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    const error = new Error(`${field} no es valido.`);
    error.status = 400;
    throw error;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    const error = new Error(`${field} no es valido.`);
    error.status = 400;
    throw error;
  }
  return parsed;
}

function hasSameDateTime(first, second) {
  const firstDate = first instanceof Date ? first : parseDate(first);
  const secondDate = second instanceof Date ? second : parseDate(second);

  if (!firstDate && !secondDate) {
    return true;
  }

  if (!firstDate || !secondDate) {
    return false;
  }

  return firstDate.getTime() === secondDate.getTime();
}

function slugify(value, fallback = 'audiencia') {
  return String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_') || fallback;
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
    hearingId: safeId(hearingId),
    hearingTitle: safeText(req.body?.hearingTitle || req.body?.title, 'title'),
    hearingDate: parseDate(req.body?.hearingDate || req.body?.date),
    caseId: safeId(req.body?.caseId || req.body?.causaId, `case-${hearingId}`),
    caseTitle: safeText(req.body?.caseTitle || req.body?.causa || req.body?.caseName, 'caseTitle') || 'Causa sin referencia',
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

function normalizeHearingResponse(hearing) {
  return {
    id: hearing.id,
    title: hearing.title || null,
    date: hearing.date || null,
    createdAt: hearing.createdAt,
    updatedAt: hearing.updatedAt,
    caseId: hearing.caseId,
    caseTitle: hearing.case?.title || 'Causa sin referencia',
    court: hearing.case?.court || null,
  };
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

async function createHearingForUser({
  prismaClient = prisma,
  req,
  user,
  body,
  activityLogger = logActivity,
}) {
  const caseId = safeId(body?.caseId || body?.causaId);
  const title = safeText(body?.title || body?.titulo, 'title');
  if (!title) {
    const error = new Error('title es obligatorio.');
    error.status = 400;
    throw error;
  }
  const date = requiredDate(body?.date || body?.fechaHora, 'date');
  const caseScopeWhere = await getCaseScopeWhere(prismaClient, {
    ...req,
    authUser: user,
  });
  const legalCase = await prismaClient.legalCase.findFirst({
    where: { id: caseId, ...caseScopeWhere },
  });
  if (!legalCase) {
    const error = new Error('No encontramos la causa seleccionada.');
    error.status = 404;
    throw error;
  }

  await prismaClient.user.upsert({
    create: { email: user.email, id: user.id, name: user.name },
    update: getUpdateData({ email: user.email, name: user.name }),
    where: { id: user.id },
  });
  const created = await prismaClient.hearing.create({
    data: {
      id: crypto.randomUUID(),
      caseId: legalCase.id,
      userId: user.id,
      title,
      date,
    },
    include: { case: true },
  });

  await activityLogger({
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    type: 'hearing',
    title: 'Audiencia registrada',
    description: 'Se registro una audiencia.',
    relatedEntityType: 'hearing',
    relatedEntityId: created.id,
    relatedEntityName: created.title || created.id,
  });

  return created;
}

async function getOrCreateHearing(req, { allowCreate }) {
  const user = req.authUser;
  const metadata = getMetadata(req, req.params.id);

  await upsertUser(user);

  const existing = await prisma.hearing.findFirst({
    include: {
      case: true,
      transcripts: {
        where: { userId: user.id },
        take: 1,
      },
    },
    where: {
      id: metadata.hearingId,
      userId: user.id,
      case: {
        userId: user.id,
      },
    },
  });

  if (existing) {
    const hearingUpdate = getUpdateData({
      date: metadata.hearingDate,
      title: metadata.hearingTitle,
    });
    const caseUpdate = getUpdateData({
      title: metadata.caseTitle,
    });
    const shouldLogCaseUpdate =
      Boolean(caseUpdate.title) &&
      normalizeOptionalString(caseUpdate.title) !== normalizeOptionalString(existing.case?.title);
    const shouldLogHearingUpdate =
      (Boolean(hearingUpdate.title) &&
        normalizeOptionalString(hearingUpdate.title) !== normalizeOptionalString(existing.title)) ||
      (hearingUpdate.date !== undefined && !hasSameDateTime(hearingUpdate.date, existing.date));

    if (Object.keys(caseUpdate).length) {
      await prisma.legalCase.update({
        data: caseUpdate,
        where: { id: existing.caseId },
      });

      if (shouldLogCaseUpdate) {
        await logActivity({
          userId: user.id,
          userEmail: user.email,
          userName: user.name,
          type: 'case',
          title: 'Causa actualizada',
          description: `Se actualizo la causa ${caseUpdate.title || existing.case?.title || existing.caseId}.`,
          relatedEntityType: 'case',
          relatedEntityId: existing.caseId,
          relatedEntityName: caseUpdate.title || existing.case?.title || existing.caseId,
        });
      }
    }

    if (Object.keys(hearingUpdate).length) {
      const updatedHearing = await prisma.hearing.update({
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

      if (shouldLogHearingUpdate) {
        await logActivity({
          userId: user.id,
          userEmail: user.email,
          userName: user.name,
          type: 'hearing',
          title: 'Audiencia modificada',
          description: `Se actualizo la audiencia ${updatedHearing.title || existing.title || existing.id}.`,
          relatedEntityType: 'hearing',
          relatedEntityId: updatedHearing.id,
          relatedEntityName: updatedHearing.title || existing.title || updatedHearing.id,
        });
      }

      return updatedHearing;
    }

    return existing;
  }

  if (!allowCreate) {
    return null;
  }

  const existingCase = await prisma.legalCase.findFirst({
    where: {
      id: metadata.caseId,
      userId: user.id,
    },
  });

  let caseRecord = existingCase;

  if (existingCase) {
    await prisma.legalCase.update({
      data: { title: metadata.caseTitle },
      where: { id: metadata.caseId },
    });

    caseRecord = {
      ...existingCase,
      title: metadata.caseTitle,
    };

    if (normalizeOptionalString(existingCase.title) !== normalizeOptionalString(metadata.caseTitle)) {
      await logActivity({
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        type: 'case',
        title: 'Causa actualizada',
        description: `Se actualizo la causa ${metadata.caseTitle || existingCase.title || metadata.caseId}.`,
        relatedEntityType: 'case',
        relatedEntityId: metadata.caseId,
        relatedEntityName: metadata.caseTitle || existingCase.title || metadata.caseId,
      });
    }
  } else {
    caseRecord = await prisma.legalCase.create({
      data: {
        id: metadata.caseId,
        title: metadata.caseTitle,
        userId: user.id,
      },
    });

    await logActivity({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      type: 'case',
      title: 'Causa creada',
      description: `Se creo la causa ${caseRecord.title || metadata.caseId}.`,
      relatedEntityType: 'case',
      relatedEntityId: caseRecord.id,
      relatedEntityName: caseRecord.title || caseRecord.id,
    });
  }

  const createdHearing = await prisma.hearing.create({
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

  await logActivity({
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    type: 'hearing',
    title: 'Audiencia registrada',
    description: `Se registro la audiencia ${createdHearing.title || createdHearing.id}.`,
    relatedEntityType: 'hearing',
    relatedEntityId: createdHearing.id,
    relatedEntityName: createdHearing.title || createdHearing.id,
  });

  return createdHearing;
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
  if (!file?.path) {
    const error = new Error('El archivo de audio es obligatorio.');
    error.status = 400;
    throw error;
  }

  const validatedFile = await validateAudioFile(file);

  const extension = validatedFile.extension;
  const fileName = `${prefix}_${Date.now()}${extension}`;
  const targetDir = getAudioDir(hearingId);
  const targetPath = ensureInsideStorage(path.join(targetDir, fileName));

  await fsp.mkdir(targetDir, { recursive: true });
  await fsp.rename(file.path, targetPath);

  return { mimeType: validatedFile.mimeType, path: targetPath };
}

async function saveChunkFile(hearingId, file, chunkIndex) {
  if (!file?.path) {
    const error = new Error('El archivo de audio es obligatorio.');
    error.status = 400;
    throw error;
  }

  const validatedFile = await validateAudioFile(file);
  const extension = validatedFile.extension;
  const fileName = `chunk_${String(chunkIndex).padStart(5, '0')}_${Date.now()}${extension}`;
  const targetDir = getChunkDir(hearingId);
  const targetPath = ensureInsideStorage(path.join(targetDir, fileName));

  await fsp.mkdir(targetDir, { recursive: true });
  await fsp.rename(file.path, targetPath);

  return { mimeType: validatedFile.mimeType, path: targetPath };
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
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500;

  if (status >= 500) {
    console.error('[HEARING_TRANSCRIPTION] No se pudo procesar la solicitud.');
  }

  return res.status(status).json({
    error: status < 500 ? error.message : fallbackMessage,
  });
}

router.use(requireFirebaseAuth);
router.use(transcriptionRateLimit);

router.get('/', async (req, res) => {
  try {
    const page = parsePositiveInteger(req.query?.page, 1, MAX_PAGE, 'page');
    const limit = parsePositiveInteger(req.query?.limit, 50, MAX_LIMIT, 'limit');
    const caseScopeWhere = await getCaseScopeWhere(prisma, req);
    const where = { case: caseScopeWhere };
    const [total, items] = await Promise.all([
      prisma.hearing.count({ where }),
      prisma.hearing.findMany({
        where,
        include: { case: true },
        orderBy: { date: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return res.json({
      items: items.map(normalizeHearingResponse),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    if (handleScopeError(res, error)) return undefined;
    if (error?.status === 400) return res.status(400).json({ error: error.message });
    console.error('[HEARING] No se pudieron cargar las audiencias.');
    return res.status(500).json({ error: 'No pudimos cargar las audiencias.' });
  }
});

router.get('/proximas', async (req, res) => {
  try {
    const caseScopeWhere = await getCaseScopeWhere(prisma, req);
    const items = await prisma.hearing.findMany({
      where: { case: caseScopeWhere, date: { gte: new Date() } },
      include: { case: true },
      orderBy: { date: 'asc' },
      take: 20,
    });
    return res.json(items.map(normalizeHearingResponse));
  } catch (error) {
    if (handleScopeError(res, error)) return undefined;
    if (error?.status === 400) return res.status(400).json({ error: error.message });
    console.error('[HEARING] No se pudieron cargar las proximas audiencias.');
    return res.status(500).json({ error: 'No pudimos cargar las proximas audiencias.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const created = await createHearingForUser({
      req,
      user: req.authUser,
      body: req.body,
    });

    return res.status(201).json(normalizeHearingResponse(created));
  } catch (error) {
    if (handleScopeError(res, error)) return undefined;
    if (error?.status === 400) return res.status(400).json({ error: error.message });
    console.error('[HEARING] No se pudo registrar la audiencia.');
    return res.status(500).json({ error: 'No pudimos registrar la audiencia.' });
  }
});

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
    const savedAudio = await saveAudioFile(hearing.id, req.file, 'audiencia');
    const transcript = await upsertTranscript(hearing, req.authUser.id, {
      audioPath: savedAudio.path,
      status: 'recording',
    });

    await prisma.file.create({
      data: {
        caseId: hearing.caseId,
        documentType: 'audio',
        fileName: path.basename(savedAudio.path),
        hearingId: hearing.id,
        mimeType: savedAudio.mimeType,
        path: savedAudio.path,
        userId: req.authUser.id,
      },
    });

    return res.status(201).json({
      success: true,
      transcriptId: transcript.id,
      audio: {
        fileName: path.basename(savedAudio.path),
        mimeType: savedAudio.mimeType,
      },
    });
  } catch (error) {
    await removeTemporaryUpload(req.file);
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

    const text = await transcribeAudioChunk({
      path: ensureInsideStorage(currentTranscript.audioPath),
      mimetype: 'audio/m4a',
      originalname: path.basename(currentTranscript.audioPath),
    });
    const transcript = await upsertTranscript(hearing, req.authUser.id, {
      status: 'completed',
      text,
    });

    await logActivity({
      userId: req.authUser.id,
      userEmail: req.authUser.email,
      userName: req.authUser.name,
      type: 'transcript',
      title: 'Transcripcion guardada',
      description: `Se guardo la transcripcion de ${hearing.title || `audiencia ${hearing.id}`}.`,
      relatedEntityType: 'hearing',
      relatedEntityId: hearing.id,
      relatedEntityName: hearing.title || hearing.id,
    });

    return res.json({
      ...normalizeTranscriptResponse(transcript, hearing),
      success: true,
    });
  } catch (error) {
    if (req.params?.id) {
      const hearing = await prisma.hearing.findFirst({
        where: {
          id: String(req.params.id),
          userId: req.authUser?.id,
          case: {
            userId: req.authUser?.id,
          },
        },
      }).catch(() => null);

      if (hearing) {
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
    const savedChunk = await saveChunkFile(hearing.id, req.file, Number.isFinite(chunkIndex) ? chunkIndex : 0);
    const text = await transcribeAudioChunk({
      mimetype: savedChunk.mimeType,
      originalname: path.basename(savedChunk.path),
      path: savedChunk.path,
    });
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
      chunkFileName: path.basename(savedChunk.path),
      fullText,
      status: transcript.status,
      text,
    });
  } catch (error) {
    await removeTemporaryUpload(req.file);
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

    await logActivity({
      userId: req.authUser.id,
      userEmail: req.authUser.email,
      userName: req.authUser.name,
      type: 'transcript',
      title: 'Transcripcion guardada',
      description: `Se guardo la transcripcion de ${hearing.title || `audiencia ${hearing.id}`}.`,
      relatedEntityType: 'hearing',
      relatedEntityId: hearing.id,
      relatedEntityName: hearing.title || hearing.id,
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

    const downloadPath = ensureInsideStorage(transcript.pdfPath);
    await fsp.access(downloadPath, fs.constants.R_OK);
    return res.download(downloadPath, path.basename(downloadPath));
  } catch (error) {
    return handleRouteError(res, error, 'No se pudo descargar el PDF.');
  }
});

router.use((error, req, res, next) => {
  if (error?.name === 'MulterError') {
    void removeTemporaryUpload(req.file);
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ error: 'El archivo de audio no cumple los limites permitidos.' });
  }

  if (error) {
    return res.status(500).json({ error: 'No se pudo procesar el archivo de audio.' });
  }

  return next();
});

module.exports = router;
module.exports.__testables = {
  createHearingForUser,
  normalizeHearingResponse,
};
