class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function badRequest(message = 'Datos invalidos.', details = null) {
  return new HttpError(400, message, details);
}

function unauthorized(message = 'No autenticado.') {
  return new HttpError(401, message);
}

function forbidden(message = 'No tenes permisos para realizar esta accion.') {
  return new HttpError(403, message);
}

function notFound(message = 'Recurso no encontrado.') {
  return new HttpError(404, message);
}

function conflict(message = 'Conflicto de datos.') {
  return new HttpError(409, message);
}

module.exports = {
  HttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
};
