const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

function getTranscriptionServiceUrl() {
  const value = String(
    process.env.TRANSCRIPTION_SERVICE_URL ||
    process.env.AI_BASE_URL ||
    process.env.WHISPER_URL ||
    ''
  ).trim().replace(/\/+$/, '');

  if (!value) {
    throw new Error('TRANSCRIPTION_SERVICE_URL debe configurarse con una URL HTTPS.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error('TRANSCRIPTION_SERVICE_URL no contiene una URL valida.');
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('TRANSCRIPTION_SERVICE_URL debe usar HTTPS para proteger el audio.');
  }

  return value;
}

function getTranscriptFromPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  return (
    payload.transcript ||
    payload.transcripcion ||
    payload.text ||
    payload.texto ||
    payload.result?.transcript ||
    payload.result?.text ||
    payload.data?.transcript ||
    payload.data?.text ||
    ''
  );
}

async function transcribeAudioChunk(file) {
  if (!file?.buffer && !file?.path) {
    throw new Error('No se recibio ningun archivo de audio.');
  }

  const formData = new FormData();
  const audio = file.buffer || fs.createReadStream(file.path);
  formData.append('audio', audio, {
    contentType: file.mimetype || 'audio/m4a',
    filename: file.originalname || `chunk-${Date.now()}.m4a`,
  });

  console.log('[TRANSCRIPTION] sending chunk to AI service');

  const response = await axios.post(`${getTranscriptionServiceUrl()}/api/transcribir`, formData, {
    headers: formData.getHeaders(),
    maxBodyLength: Number(process.env.TRANSCRIPTION_CHUNK_MAX_BYTES || 50 * 1024 * 1024),
    maxContentLength: 1024 * 1024,
    timeout: Number(process.env.TRANSCRIPTION_TIMEOUT_MS || 120000),
  });

  const text = String(getTranscriptFromPayload(response.data) || '').trim();

  console.log('[TRANSCRIPTION] chunk transcribed');

  return text;
}

module.exports = {
  transcribeAudioChunk,
};
