const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const multer = require('multer');
const path = require('path');

const prisma = require('../lib/prisma');
const { requireFirebaseAuth } = require('../middleware/firebaseAuth');
const { logActivity } = require('../utils/activityLogger.js');

const router = express.Router();
const upload = multer({
  limits: {
    fileSize: Number(process.env.DOCUMENT_MAX_BYTES || 50 * 1024 * 1024),
  },
  storage: multer.memoryStorage(),
});
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

function slugify(value, fallback = 'documento') {
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

function getDocumentDir(userId, hearingId) {
  return ensureInsideStorage(path.join(STORAGE_ROOT, 'documentos', String(userId), String(hearingId)));
}

async function upsertUser(user) {
  if (!user?.id) {
    return null;
  }

  return prisma.user.upsert({
    create: {
      email: user.email,
      id: user.id,
      name: user.name,
    },
    update: {
      email: user.email || undefined,
      name: user.name || undefined,
    },
    where: {
      id: user.id,
    },
  });
}

async function getOwnedHearing(hearingId, userId) {
  return prisma.hearing.findFirst({
    include: {
      case: true,
    },
    where: {
      id: String(hearingId),
      userId,
    },
  });
}

async function saveUploadedDocument({ baseName, file, hearingId, userId }) {
  if (!file?.buffer) {
    const error = new Error('El archivo es obligatorio.');
    error.status = 400;
    throw error;
  }

  const extension = path.extname(file.originalname || '') || '.bin';
  const safeBaseName = slugify(
    baseName || path.basename(file.originalname || 'documento', extension),
    'documento'
  );
  const finalFileName = `${safeBaseName}_${Date.now()}${extension}`;
  const targetDir = getDocumentDir(userId, hearingId);
  const targetPath = ensureInsideStorage(path.join(targetDir, finalFileName));

  await fsp.mkdir(targetDir, { recursive: true });
  await fsp.writeFile(targetPath, file.buffer);

  return {
    fileName: finalFileName,
    path: targetPath,
  };
}

function buildDocumentDownloadPath(file) {
  return `/api/v1/documentos/${encodeURIComponent(file.id)}/download`;
}

function normalizeFileResponse(file) {
  const hearing = file.hearing || null;
  const legalCase = file.case || hearing?.case || null;

  return {
    id: file.id,
    caseId: file.caseId,
    caseTitle: legalCase?.title || 'Causa sin referencia',
    createdAt: file.createdAt,
    documentType: file.documentType || 'Documento',
    fileName: file.fileName,
    hearingId: file.hearingId,
    hearingTitle: hearing?.title || 'Audiencia sin referencia',
    mimeType: file.mimeType,
    path: buildDocumentDownloadPath(file),
    uploadedAt: file.createdAt,
  };
}

router.use(requireFirebaseAuth);

router.post('/', upload.single('file'), async (req, res) => {
  const requestUser = req.user || req.authUser;

  try {
    const hearingId = normalizeOptionalString(req.body?.hearingId || req.body?.audienciaId);
    const documentType = normalizeOptionalString(req.body?.documentType || req.body?.tipo) || 'Documento';
    const baseName = normalizeOptionalString(req.body?.baseName || req.body?.nombreBase);

    if (!requestUser?.id) {
      return res.status(401).json({
        error: 'Token Firebase ausente o invalido.',
      });
    }

    if (!hearingId) {
      return res.status(400).json({
        error: 'La audiencia es obligatoria para subir un documento.',
      });
    }

    await upsertUser(requestUser);

    const hearing = await getOwnedHearing(hearingId, requestUser.id);

    if (!hearing) {
      return res.status(404).json({
        error: 'No encontramos la audiencia seleccionada.',
      });
    }

    const savedFile = await saveUploadedDocument({
      baseName,
      file: req.file,
      hearingId: hearing.id,
      userId: requestUser.id,
    });

    const createdDocument = await prisma.file.create({
      data: {
        caseId: hearing.caseId,
        documentType,
        fileName: savedFile.fileName,
        hearingId: hearing.id,
        mimeType: req.file?.mimetype || 'application/octet-stream',
        path: savedFile.path,
        userId: requestUser.id,
      },
      include: {
        case: true,
        hearing: {
          include: {
            case: true,
          },
        },
      },
    });

    createdDocument.originalName = req.file?.originalname || null;

    await logActivity({
      userId: requestUser.id,
      type: 'document',
      title: 'Documento subido',
      description: `Se subió el documento ${createdDocument.originalName || createdDocument.fileName}${createdDocument.hearing?.title ? ` en ${createdDocument.hearing.title}` : ''}`,
      relatedEntityType: 'document',
      relatedEntityId: createdDocument.id,
      relatedEntityName: createdDocument.originalName || createdDocument.fileName,
    });

    return res.status(201).json(normalizeFileResponse(createdDocument));
  } catch (error) {
    console.error('[DOCUMENTS] Error subiendo documento:', error);
    return res.status(error?.status || 500).json({
      error: error?.message || 'No se pudo subir el documento.',
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const files = await prisma.file.findMany({
      include: {
        case: true,
        hearing: {
          include: {
            case: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      where: {
        userId: req.authUser.id,
      },
    });

    return res.json(files.map((file) => normalizeFileResponse(file)));
  } catch (error) {
    console.error('[DOCUMENTS] Error listando documentos:', error);
    return res.status(500).json({
      error: 'No se pudieron cargar los documentos.',
    });
  }
});

router.get('/:id/download', async (req, res) => {
  try {
    const file = await prisma.file.findFirst({
      where: {
        id: req.params.id,
        userId: req.authUser.id,
      },
    });

    if (!file) {
      return res.status(404).json({
        error: 'No encontramos el documento solicitado.',
      });
    }

    await fs.promises.access(file.path, fs.constants.R_OK);
    return res.download(file.path, path.basename(file.fileName || file.path));
  } catch (error) {
    console.error('[DOCUMENTS] Error descargando documento:', error);
    return res.status(500).json({
      error: 'No se pudo descargar el documento.',
    });
  }
});

module.exports = router;
