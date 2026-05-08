const { badRequest } = require('./httpErrors');

function toIntId(value, fieldName = 'id') {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw badRequest(`Datos invalidos. ${fieldName} debe ser numerico.`);
  }

  return parsed;
}

module.exports = {
  toIntId,
};
