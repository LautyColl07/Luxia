// Presentation helpers consume the existing API adapter; they do not classify
// legal documents or introduce fields into the document contract.
export function getDocumentName(document) {
  return document?.originalName || document?.filename || document?.fileName || 'Documento sin nombre';
}

export function getDocumentFileKind(document) {
  const mime = String(document?.mimeType || '').toLowerCase().split(';')[0].trim();
  const extension = getDocumentName(document).split('.').pop().toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'application/msword') return 'doc';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'text/plain') return 'txt';
  // A specific MIME wins over a misleading filename extension.
  if (mime && mime !== 'application/octet-stream') return 'other';
  if (['pdf', 'doc', 'docx', 'txt'].includes(extension)) return extension;
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'bmp', 'svg'].includes(extension)) return 'image';
  return 'other';
}

export function formatDocumentSize(sizeBytes) {
  if (sizeBytes === null || sizeBytes === undefined || sizeBytes === '') return null;
  const bytes = Number(sizeBytes);
  if (!Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const unit = bytes < 1024 * 1024 ? 'KB' : bytes < 1024 * 1024 * 1024 ? 'MB' : 'GB';
  const divisor = unit === 'KB' ? 1024 : unit === 'MB' ? 1024 ** 2 : 1024 ** 3;
  return `${(bytes / divisor).toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${unit}`;
}

export function getDocumentAssociation(value, fallback) {
  return value && value !== fallback ? value : null;
}

export function getDocumentDownloadUrl(document, apiRootUrl, activeContext) {
  const path = document?.downloadUrl || document?.path;
  if (!path) return null;
  try {
    const root = new URL(apiRootUrl);
    const url = new URL(path, root);
    if (url.origin !== root.origin || !/^\/api\/v1\/documentos\/\d+\/download$/.test(url.pathname)) return null;
    if (activeContext?.type === 'study' && activeContext.legalStudyId) {
      url.searchParams.set('scope', 'study');
      url.searchParams.set('legalStudyId', String(activeContext.legalStudyId));
    } else {
      url.searchParams.set('scope', 'personal');
    }
    return url.toString();
  } catch {
    return null;
  }
}
