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

function detectDocumentKind(buffer) {
  if (hasPrefix(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf';
  if (hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (hasPrefix(buffer, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (hasPrefix(buffer, [0x42, 0x4d])) return 'bmp';
  if (hasPrefix(buffer, [0x49, 0x49, 0x2a, 0x00]) || hasPrefix(buffer, [0x4d, 0x4d, 0x00, 0x2a])) return 'tiff';
  if (hasPrefix(buffer, [0x52, 0x49, 0x46, 0x46]) && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (hasPrefix(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'doc';

  const brand = getIsoBrand(buffer);
  if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'heic';

  if (hasPrefix(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    const contents = buffer.toString('latin1');
    if (contents.includes('[Content_Types].xml') && contents.includes('word/document.xml')) return 'docx';
  }

  return null;
}

function detectAudioKind(buffer) {
  if (hasPrefix(buffer, [0x49, 0x44, 0x33]) || (buffer[0] === 0xff && [0xe2, 0xe3, 0xfa, 0xfb].includes(buffer[1]))) return 'mp3';
  if (buffer[0] === 0xff && [0xf1, 0xf9].includes(buffer[1])) return 'aac';
  if (hasPrefix(buffer, [0x52, 0x49, 0x46, 0x46]) && buffer.subarray(8, 12).toString('ascii') === 'WAVE') return 'wav';
  if (hasPrefix(buffer, [0x4f, 0x67, 0x67, 0x53])) return 'ogg';
  if (hasPrefix(buffer, [0x66, 0x4c, 0x61, 0x43])) return 'flac';
  if (hasPrefix(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return 'webm';

  const brand = getIsoBrand(buffer);
  if (brand) return ['m4a ', 'm4b ', 'm4p ', 'isom', 'iso2', 'mp41', 'mp42', 'avc1'].includes(brand) ? 'm4a' : null;

  return null;
}

function declaredExtensionMatches(kind, originalname, signatures) {
  const extension = path.extname(String(originalname || '')).toLowerCase();
  if (!extension) return true;
  if (kind === 'jpeg') return extension === '.jpg' || extension === '.jpeg';
  if (kind === 'tiff') return extension === '.tif' || extension === '.tiff';
  if (kind === 'heic') return extension === '.heic' || extension === '.heif';
  if (kind === 'm4a') return extension === '.m4a' || extension === '.mp4';
  return signatures[kind]?.extension === extension;
}

function isGenericMimeType(value) {
  return !value || value === 'application/octet-stream' || value === 'binary/octet-stream';
}

function declaredMimeMatches(kind, mimeType, signatures) {
  if (isGenericMimeType(mimeType)) return true;
  if (kind === 'heic') return mimeType === 'image/heic' || mimeType === 'image/heif';
  if (kind === 'm4a') return mimeType === 'audio/mp4' || mimeType === 'audio/m4a' || mimeType === 'audio/x-m4a' || mimeType === 'video/mp4';
  return signatures[kind]?.mimeType === mimeType;
}

function validateFile(file, detectKind, signatures, message) {
  const buffer = file?.buffer;
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw inputError(message);

  const kind = detectKind(buffer);
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
