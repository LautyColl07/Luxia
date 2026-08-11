const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const prisma = require('../lib/prisma');
const { documentsRateLimit } = require('../lib/rateLimit');
const { validateDocumentFile } = require('../lib/fileValidation');
const { STORAGE_ROOT, createUpload, ensureInsideStorage, removeTemporaryUpload } = require('../lib/upload');
const { requireFirebaseAuth } = require('../middleware/firebaseAuth');
const { getCaseScopeWhere, handleScopeError } = require('../lib/studyScope');
const { logActivity } = require('../utils/activityLogger');

const router = express.Router();
const upload = createUpload({
  limits: {
    fieldNameSize: 100,
    fieldSize: 16 * 1024,
    fileSize: Number(process.env.DOCUMENT_MAX_BYTES || 50 * 1024 * 1024),
    files: 1,
    fields: 8,
    parts: 10,
  },
});
const MAX_DOCUMENT_TYPE_LENGTH = 120;
const MAX_PAGE = 10000;
const MAX_LIMIT = 100;

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

function getDocumentDir(userId, hearingId) {
  return ensureInsideStorage(path.join(STORAGE_ROOT, 'documentos', String(userId), String(hearingId)));
}

async function upsertUser(user) {
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

async function getScopedHearing(hearingId, req) {
  const caseScopeWhere = await getCaseScopeWhere(prisma, req);
  return prisma.hearing.findFirst({
    include: {
      case: true,
    },
    where: {
      id: String(hearingId),
      case: {
        ...caseScopeWhere,
      },
    },
  });
}

function buildScopedFileWhere(caseScopeWhere) {
  return { case: caseScopeWhere };
}

async function saveUploadedDocument({ baseName, file, hearingId, userId }) {
  if (!file?.path) {
    const error = new Error('El archivo es obligatorio.');
    error.status = 400;
    throw error;
  }

  const validatedFile = await validateDocumentFile(file);

  const extension = validatedFile.extension;
  const safeBaseName = slugify(baseName || path.basename(file.originalname || 'documento', extension), 'documento');
  const finalFileName = `${safeBaseName}_${Date.now()}${extension}`;
  const targetDir = getDocumentDir(userId, hearingId);
  const targetPath = ensureInsideStorage(path.join(targetDir, finalFileName));

  await fsp.mkdir(targetDir, { recursive: true });
  await fsp.rename(file.path, targetPath);

  return {
    fileName: finalFileName,
    mimeType: validatedFile.mimeType,
    path: targetPath,
  };
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

function validateDocumentId(value) {
  const id = normalizeOptionalString(value);
  if (!id || id.length > 191 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    const error = new Error('El identificador del documento no es valido.');
    error.status = 400;
    throw error;
  }
  return id;
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
router.use(documentsRateLimit);

router.post('/', upload.single('file'), async (req, res) => {
  let savedFile = null;
  try {
    const hearingId = normalizeOptionalString(req.body?.hearingId || req.body?.audienciaId);
    const documentType = normalizeOptionalString(req.body?.documentType || req.body?.tipo) || 'Documento';
    const baseName = normalizeOptionalString(req.body?.baseName || req.body?.nombreBase);

    if (!hearingId) {
      return res.status(400).json({
        error: 'La audiencia es obligatoria para subir un documento.',
      });
    }

    if (documentType.length > MAX_DOCUMENT_TYPE_LENGTH) {
      return res.status(400).json({
        error: 'El tipo de documento supera la longitud permitida.',
      });
    }

    await upsertUser(req.authUser);

    const hearing = await getScopedHearing(hearingId, req);

    if (!hearing) {
      return res.status(404).json({
        error: 'No encontramos la audiencia seleccionada.',
      });
    }

    savedFile = await saveUploadedDocument({
      baseName,
      file: req.file,
      hearingId: hearing.id,
      userId: req.authUser.id,
    });

    const created = await prisma.file.create({
      data: {
        caseId: hearing.caseId,
        documentType,
        fileName: savedFile.fileName,
        hearingId: hearing.id,
        mimeType: savedFile.mimeType,
        path: savedFile.path,
        userId: req.authUser.id,
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

    await logActivity({
      userId: req.authUser.id,
      userEmail: req.authUser.email,
      userName: req.authUser.name,
      type: 'document',
      title: 'Documento subido',
      description: `Se subio el documento ${created.fileName}.`,
      relatedEntityType: 'document',
      relatedEntityId: created.id,
      relatedEntityName: created.fileName,
    });

    return res.status(201).json(normalizeFileResponse(created));
  } catch (error) {
    if (savedFile?.path) {
      await fsp.unlink(savedFile.path).catch(() => null);
    } else {
      await removeTemporaryUpload(req.file);
    }
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500
      ? error.status
      : 500;
    if (status >= 500) {
      console.error('[DOCUMENTS] No se pudo subir el documento.');
    }
    return res.status(status).json({
      error: status < 500 ? error.message : 'No se pudo subir el documento.',
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const page = parsePositiveInteger(req.query?.page, 1, MAX_PAGE, 'page');
    const limit = parsePositiveInteger(req.query?.limit, 50, MAX_LIMIT, 'limit');
    const caseScopeWhere = await getCaseScopeWhere(prisma, req);
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
      where: buildScopedFileWhere(caseScopeWhere),
      skip: (page - 1) * limit,
      take: limit,
    });

    return res.json(files.map((file) => normalizeFileResponse(file)));
  } catch (error) {
    if (handleScopeError(res, error)) return undefined;
    if (error?.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    console.error('[DOCUMENTS] No se pudieron listar los documentos.');
    return res.status(500).json({
      error: 'No se pudieron cargar los documentos.',
    });
  }
});

router.get('/:id/download', async (req, res) => {
  try {
    const documentId = validateDocumentId(req.params.id);
    const caseScopeWhere = await getCaseScopeWhere(prisma, req);
    const file = await prisma.file.findFirst({
      where: {
        id: documentId,
        ...buildScopedFileWhere(caseScopeWhere),
      },
    });

    if (!file) {
      return res.status(404).json({
        error: 'No encontramos el documento solicitado.',
      });
    }

    const downloadPath = ensureInsideStorage(file.path);
    await fs.promises.access(downloadPath, fs.constants.R_OK);
    return res.download(downloadPath, path.basename(file.fileName || downloadPath));
  } catch (error) {
    if (handleScopeError(res, error)) return undefined;
    if (error?.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    console.error('[DOCUMENTS] No se pudo descargar el documento.');
    return res.status(500).json({
      error: 'No se pudo descargar el documento.',
    });
  }
});

router.use((error, req, res, next) => {
  if (error?.name === 'MulterError') {
    void removeTemporaryUpload(req.file);
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ error: 'El archivo no cumple los limites permitidos.' });
  }

  if (error) {
    return res.status(500).json({ error: 'No se pudo procesar el archivo.' });
  }

  return next();
});

module.exports = router;
module.exports.__testables = {
  buildScopedFileWhere,
};
