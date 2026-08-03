const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const multer = require('multer');

const STORAGE_ROOT =
  process.env.LUXIA_STORAGE_ROOT ||
  (process.platform === 'win32' ? path.resolve(process.cwd(), 'storage') : '/opt/luxia/storage');
const TEMP_UPLOAD_ROOT = path.resolve(STORAGE_ROOT, '.tmp-uploads');

function ensureInsideStorage(targetPath) {
  const resolvedRoot = path.resolve(STORAGE_ROOT);
  const resolvedTarget = path.resolve(targetPath);
  const relativePath = path.relative(resolvedRoot, resolvedTarget);

  if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new Error('Ruta de storage invalida.');
  }

  return resolvedTarget;
}

const storage = multer.diskStorage({
  destination(_req, _file, callback) {
    fs.mkdir(TEMP_UPLOAD_ROOT, { recursive: true }, (error) => callback(error, TEMP_UPLOAD_ROOT));
  },
  filename(_req, _file, callback) {
    callback(null, crypto.randomUUID());
  },
});

function createUpload(limits) {
  return multer({ limits, storage });
}

async function removeTemporaryUpload(file) {
  if (!file?.path) return;

  try {
    const targetPath = ensureInsideStorage(file.path);
    if (path.dirname(targetPath) !== TEMP_UPLOAD_ROOT) return;
    await fsp.unlink(targetPath);
  } catch {
    // A failed cleanup must not disclose the internal path or hide the request error.
  }
}

module.exports = {
  STORAGE_ROOT,
  createUpload,
  ensureInsideStorage,
  removeTemporaryUpload,
};
