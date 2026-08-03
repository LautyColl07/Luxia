const axios = require('axios');

const OLLAMA_URL = process.env.OLLAMA_URL;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
const LUX_TIMEOUT_MS = Math.max(1000, Math.min(Number(process.env.LUX_TIMEOUT_MS) || 120000, 180000));

const SYSTEM_PROMPT =
  'Eres LUX, el asistente inteligente de Luxia. Ayudas a usuarios de un sistema judicial/legal a consultar información de causas, audiencias, documentos, transcripciones y registros. Responde en español, de forma clara, breve, profesional y prudente. No inventes datos. Si no tienes información suficiente, dilo. No des asesoramiento legal definitivo; presenta información organizada y sugiere revisar con un profesional responsable.';

const FALLBACK_REPLY =
  'No tengo información suficiente para responder con precisión en este momento. Revisa la información disponible en Luxia o consulta con el profesional responsable.';

async function sendMessageToLux(message, context = {}) {
  if (!message || typeof message !== 'string' || !message.trim()) {
    throw new Error('El mensaje es obligatorio.');
  }

  if (!OLLAMA_URL) {
    throw new Error('OLLAMA_URL no está configurada.');
  }

  try {
    const response = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model: OLLAMA_MODEL,
      stream: false,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: `Consulta del usuario: ${message}\n\nContexto disponible: ${JSON.stringify(context || {})}`,
        },
      ],
    }, {
      timeout: LUX_TIMEOUT_MS,
    });

    const reply = response?.data?.message?.content;

    if (!reply || typeof reply !== 'string' || !reply.trim()) {
      return FALLBACK_REPLY;
    }

    return reply.trim();
  } catch (error) {
    console.error('[LUX] No se pudo completar la consulta con el servicio de IA.');
    throw error;
  }
}

module.exports = {
  sendMessageToLux,
};
