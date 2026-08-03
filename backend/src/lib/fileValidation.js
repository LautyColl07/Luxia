const fs = require('fs/promises');
const path = require('path');

const DOCUMENT_SIGNATURES = {
  bmp: { extension: '.bmp', mimeType: 'image/bmp' },
  doc: { extension: '.doc', mimeType: 'application/msword' },
  docx: { extension: '.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  heic: { extension: '.heic', mimeType: 'image/heic' },
  jpeg: { extension: '.jpg', mimeType: 'image/jpeg' },
  pdf: { extension: '.pdf', mimeType: 'application/pdf' },
  png: { extension: '.png', mimeType: 'image/png' },
  tiff: { extension: '.tiff', mimeType: 'image/tiff' },
  webp: { extension: '.webp', mimeType: 'image/webp' },
};
const AUDIO_SIGNATURES = {
  aac: { extension: '.aac', mimeType: 'audio/aac' },
  flac: { extension: '.flac', mimeType: 'audio/flac' },
  m4a: { extension: '.m4a', mimeType: 'audio/mp4' },
  mp3: { extension: '.mp3', mimeType: 'audio/mpeg' },
  mp4: { extension: '.mp4', mimeType: 'video/mp4' },
  ogg: { extension: '.ogg', mimeType: 'audio/ogg' },
  wav: { extension: '.wav', mimeType: 'audio/wav' },
  webm: { extension: '.webm', mimeType: 'audio/webm' },
};
const MAX_SIGNATURE_BYTES = 64 * 1024;
const MAX_ZIP_DIRECTORY_BYTES = 128 * 1024;

function inputError(message) {
  const error = new Error(message);
  error.status = 415;
  return error;
}

function hasPrefix(buffer, bytes, offset = 0) {
  return buffer.length >= offset + bytes.length && bytes.every((byte, index) => buffer[offset + index] === byte);
}

function getIsoBrand(buffer) {
  return buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp'
    ? buffer.subarray(8, 12).toString('ascii').toLowerCase()
    : '';
}

function hasMinimalDocxStructure(tail, totalSize) {
  const eocdSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const eocdOffset = tail.lastIndexOf(eocdSignature);
  if (eocdOffset < 0 || tail.length < eocdOffset + 22) return false;

  const commentLength = tail.readUInt16LE(eocdOffset + 20);
  if (eocdOffset + 22 + commentLength !== tail.length) return false;
  const centralSize = tail.readUInt32LE(eocdOffset + 12);
  const centralOffset = tail.readUInt32LE(eocdOffset + 16);
  const tailStart = totalSize - tail.length;
  const centralStart = centralOffset - tailStart;
  const centralEnd = centralStart + centralSize;
  if (centralSize < 46 || centralSize > MAX_ZIP_DIRECTORY_BYTES || centralStart < 0 || centralEnd > tail.length) return false;

  let offset = centralStart;
  let hasContentTypes = false;
  let hasDocumentXml = false;
  while (offset < centralEnd) {
    if (offset + 46 > centralEnd || tail.readUInt32LE(offset) !== 0x02014b50) return false;
    const nameLength = tail.readUInt16LE(offset + 28);
    const extraLength = tail.readUInt16LE(offset + 30);
    const entryCommentLength = tail.readUInt16LE(offset + 32);
    const nextOffset = offset + 46 + nameLength + extraLength + entryCommentLength;
    if (nextOffset > centralEnd) return false;
    const entryName = tail.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    hasContentTypes ||= entryName === '[Content_Types].xml';
    hasDocumentXml ||= entryName === 'word/document.xml';
    offset = nextOffset;
  }

  return offset === centralEnd && hasContentTypes && hasDocumentXml;
}

function detectDocumentKind(header, tail, totalSize) {
  if (hasPrefix(header, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf';
  if (hasPrefix(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (hasPrefix(header, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (hasPrefix(header, [0x42, 0x4d])) return 'bmp';
  if (hasPrefix(header, [0x49, 0x49, 0x2a, 0x00]) || hasPrefix(header, [0x4d, 0x4d, 0x00, 0x2a])) return 'tiff';
  if (hasPrefix(header, [0x52, 0x49, 0x46, 0x46]) && header.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  // Legacy DOC is accepted only when the OLE compound-file signature is present.
  if (hasPrefix(header, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'doc';

  if (hasPrefix(header, [0x50, 0x4b, 0x03, 0x04]) && hasMinimalDocxStructure(tail, totalSize)) return 'docx';

  const brand = getIsoBrand(header);
  if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'heic';

  return null;
}

function detectAudioKind(header) {
  if (hasPrefix(header, [0x49, 0x44, 0x33]) || (header[0] === 0xff && [0xe2, 0xe3, 0xfa, 0xfb].includes(header[1]))) return 'mp3';
  if (header[0] === 0xff && [0xf1, 0xf9].includes(header[1])) return 'aac';
  if (hasPrefix(header, [0x52, 0x49, 0x46, 0x46]) && header.subarray(8, 12).toString('ascii') === 'WAVE') return 'wav';
  if (hasPrefix(header, [0x4f, 0x67, 0x67, 0x53])) return 'ogg';
  if (hasPrefix(header, [0x66, 0x4c, 0x61, 0x43])) return 'flac';
  if (hasPrefix(header, [0x1a, 0x45, 0xdf, 0xa3])) return 'webm';

  const brand = getIsoBrand(header);
  if (['m4a ', 'm4b ', 'm4p '].includes(brand)) return 'm4a';
  return ['isom', 'iso2', 'mp41', 'mp42', 'avc1'].includes(brand) ? 'mp4' : null;
}

function declaredExtensionMatches(kind, originalname, signatures) {
  const normalizedName = path.basename(String(originalname || ''));
  const extension = path.extname(normalizedName).toLowerCase();
  if (!extension) return true; // iOS/Android providers may omit a name.
  if (kind === 'jpeg') return extension === '.jpg' || extension === '.jpeg';
  if (kind === 'tiff') return extension === '.tif' || extension === '.tiff';
  if (kind === 'heic') return extension === '.heic' || extension === '.heif';
  return signatures[kind]?.extension === extension;
}

function isGenericMimeType(value) {
  return !value || value === 'application/octet-stream' || value === 'binary/octet-stream';
}

function declaredMimeMatches(kind, mimeType, signatures) {
  if (isGenericMimeType(mimeType)) return true; // Signature remains mandatory.
  if (kind === 'heic') return mimeType === 'image/heic' || mimeType === 'image/heif';
  if (kind === 'm4a') return mimeType === 'audio/mp4' || mimeType === 'audio/m4a' || mimeType === 'audio/x-m4a';
  return signatures[kind]?.mimeType === mimeType;
}

async function readInspectionBytes(file) {
  if (Buffer.isBuffer(file?.buffer)) {
    return { header: file.buffer.subarray(0, MAX_SIGNATURE_BYTES), size: file.buffer.length, tail: file.buffer.subarray(-MAX_ZIP_DIRECTORY_BYTES) };
  }
  if (!file?.path || !Number.isFinite(file.size) || file.size < 1) return null;

  const handle = await fs.open(file.path, 'r');
  try {
    const headerLength = Math.min(file.size, MAX_SIGNATURE_BYTES);
    const tailLength = Math.min(file.size, MAX_ZIP_DIRECTORY_BYTES);
    const header = Buffer.alloc(headerLength);
    const tail = Buffer.alloc(tailLength);
    await handle.read(header, 0, headerLength, 0);
    await handle.read(tail, 0, tailLength, Math.max(0, file.size - tailLength));
    return { header, size: file.size, tail };
  } finally {
    await handle.close();
  }
}

async function validateFile(file, detectKind, signatures, message) {
  const inspection = await readInspectionBytes(file);
  if (!inspection?.header.length) throw inputError(message);

  const kind = detectKind(inspection.header, inspection.tail, inspection.size);
  const mimeType = String(file?.mimetype || '').trim().toLowerCase();
  if (!kind || !declaredExtensionMatches(kind, file?.originalname, signatures) || !declaredMimeMatches(kind, mimeType, signatures)) {
    throw inputError(message);
  }

  return { kind, ...signatures[kind] };
}

function validateDocumentFile(file) {
  return validateFile(file, detectDocumentKind, DOCUMENT_SIGNATURES, 'El archivo no coincide con un formato de documento permitido.');
}

function validateAudioFile(file) {
  return validateFile(file, detectAudioKind, AUDIO_SIGNATURES, 'El archivo no coincide con un formato de audio permitido.');
}

module.exports = { validateAudioFile, validateDocumentFile };
