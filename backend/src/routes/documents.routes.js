const express = require('express');
const fs = require('fs');
const path = require('path');

const prisma = require('../lib/prisma');
const { requireFirebaseAuth } = require('../middleware/firebaseAuth');

const router = express.Router();

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
