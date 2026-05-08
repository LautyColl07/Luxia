const { Prisma } = require('@prisma/client');

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  console.error('[API ERROR]', {
    method: req.method,
    path: req.originalUrl,
    status: error.status || 500,
    code: error.code || null,
    message: error.message,
    details: error.details || null,
    stack: error.stack,
  });

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'Conflicto de datos.' });
    }
  }

  const status = error.status || 500;
  const message =
    status >= 500
      ? 'No pudimos procesar la solicitud en este momento.'
      : error.message || 'Error inesperado.';

  return res.status(status).json({
    message,
    details: error.details || null,
  });
}

module.exports = errorHandler;
