import { Linking } from 'react-native';

export const OFFICIAL_LEGAL_HOSTS = new Set([
  'argentina.gob.ar', 'www.argentina.gob.ar', 'servicios.infoleg.gob.ar',
  'sjconsulta.csjn.gov.ar', 'csjn.gov.ar', 'www.csjn.gov.ar',
  'boletinoficial.gob.ar', 'www.boletinoficial.gob.ar',
]);

export function isAllowedOfficialUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && OFFICIAL_LEGAL_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export async function openOfficialLegalUrl(value) {
  if (!isAllowedOfficialUrl(value)) return false;
  await Linking.openURL(value);
  return true;
}

export function normalizeLegalResponse(response) {
  const envelope = response && typeof response === 'object' ? response : {};
  const data = envelope.data && typeof envelope.data === 'object' ? envelope.data : envelope;
  return {
    answer: String(data.answer || envelope.answer || 'No encontramos una respuesta con la evidencia disponible.'),
    insufficientEvidence: Boolean(data.insufficientEvidence),
    citations: Array.isArray(data.legalCitations) ? data.legalCitations : Array.isArray(envelope.legalCitations) ? envelope.legalCitations : [],
    conversationId: data.conversationId || envelope.conversationId || null,
  };
}
