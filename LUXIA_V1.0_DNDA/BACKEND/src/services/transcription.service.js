const axios = require('axios');
const FormData = require('form-data');

const DEFAULT_AI_BASE_URL = 'http://127.0.0.1:5000';

const AI_BASE_URL =
  process.env.TRANSCRIPTION_SERVICE_URL ||
  process.env.AI_BASE_URL ||
  process.env.WHISPER_URL ||
  DEFAULT_AI_BASE_URL;

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
  if (!file?.buffer) {
    throw new Error('No se recibio ningun archivo de audio.');
  }

  const formData = new FormData();
  formData.append('audio', file.buffer, {
    contentType: file.mimetype || 'audio/m4a',
    filename: file.originalname || `chunk-${Date.now()}.m4a`,
  });

  console.log('[TRANSCRIPTION] sending chunk to AI service');

  const response = await axios.post(`${AI_BASE_URL}/api/transcribir`, formData, {
    headers: formData.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: Number(process.env.TRANSCRIPTION_TIMEOUT_MS || 120000),
  });

  const text = String(getTranscriptFromPayload(response.data) || '').trim();

  console.log('[TRANSCRIPTION] chunk transcribed');

  return text;
}

module.exports = {
  transcribeAudioChunk,
};
