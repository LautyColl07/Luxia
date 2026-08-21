const rateLimit = require('express-rate-limit');

function createJsonRateLimit({ max, message, windowMs }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message,
    },
  });
}

const authWindowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const authMax = Number(process.env.AUTH_RATE_LIMIT_MAX || 10);
const luxWindowMs = Number(process.env.LUX_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const luxMax = Number(process.env.LUX_RATE_LIMIT_MAX || 20);

const authRateLimit = createJsonRateLimit({
  windowMs: authWindowMs,
  max: authMax,
  message: 'Demasiados intentos de autenticacion. Intenta nuevamente en unos minutos.',
});

const luxRateLimit = createJsonRateLimit({
  windowMs: luxWindowMs,
  max: luxMax,
  message: 'Demasiadas consultas a LUX. Intenta nuevamente en unos minutos.',
});

module.exports = {
  authRateLimit,
  luxRateLimit,
};
