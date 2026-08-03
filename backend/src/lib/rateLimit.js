const { ipKeyGenerator } = require('express-rate-limit');
const rateLimit = require('express-rate-limit');

function readPositiveInteger(value, fallback, maximum) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, maximum);
}

function createJsonRateLimit({ max, message, windowMs }) {
  return rateLimit({
    keyGenerator(req) {
      const uid = typeof req.authUser?.id === 'string' ? req.authUser.id.trim() : '';
      return uid ? `uid:${uid}` : `ip:${ipKeyGenerator(req.ip)}`;
    },
    legacyHeaders: false,
    max,
    message: {
      error: message,
      message,
      success: false,
    },
    standardHeaders: true,
    windowMs,
  });
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const apiRateLimit = createJsonRateLimit({
  max: readPositiveInteger(process.env.API_RATE_LIMIT_MAX, 900, 5000),
  message: 'Demasiadas solicitudes. Intentá nuevamente en unos minutos.',
  windowMs: FIFTEEN_MINUTES,
});
const authRateLimit = createJsonRateLimit({
  max: readPositiveInteger(process.env.AUTH_RATE_LIMIT_MAX, 10, 100),
  message: 'Demasiados intentos de autenticacion. Intenta nuevamente en unos minutos.',
  windowMs: readPositiveInteger(process.env.AUTH_RATE_LIMIT_WINDOW_MS, FIFTEEN_MINUTES, 24 * 60 * 60 * 1000),
});
const activityRateLimit = createJsonRateLimit({
  max: 240,
  message: 'Demasiadas consultas al historial. Intentá nuevamente en unos minutos.',
  windowMs: FIFTEEN_MINUTES,
});
const documentsRateLimit = createJsonRateLimit({
  max: 180,
  message: 'Demasiadas operaciones sobre documentos. Intentá nuevamente en unos minutos.',
  windowMs: FIFTEEN_MINUTES,
});
const luxRateLimit = createJsonRateLimit({
  max: readPositiveInteger(process.env.LUX_RATE_LIMIT_MAX, 30, 300),
  message: 'Demasiadas consultas a LUX. Intenta nuevamente en unos minutos.',
  windowMs: readPositiveInteger(process.env.LUX_RATE_LIMIT_WINDOW_MS, FIFTEEN_MINUTES, 24 * 60 * 60 * 1000),
});
const searchRateLimit = createJsonRateLimit({
  max: 240,
  message: 'Demasiadas consultas. Intentá nuevamente en unos minutos.',
  windowMs: FIFTEEN_MINUTES,
});
const transcriptionRateLimit = createJsonRateLimit({
  max: 360,
  message: 'Demasiadas operaciones de transcripcion. Intentá nuevamente en unos minutos.',
  windowMs: FIFTEEN_MINUTES,
});

module.exports = {
  activityRateLimit,
  apiRateLimit,
  authRateLimit,
  documentsRateLimit,
  luxRateLimit,
  searchRateLimit,
  transcriptionRateLimit,
};
