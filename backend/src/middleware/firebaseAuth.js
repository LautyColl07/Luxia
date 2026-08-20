const { getFirebaseAdmin } = require('../lib/firebaseAdmin');

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

async function verifyWithFirebaseAdmin(token) {
  const admin = getFirebaseAdmin();
  // Check revocation as well as signature and expiry for every protected route.
  return admin.auth().verifyIdToken(token, true);
}

async function getAuthenticatedUserFromRequest(req) {
  const header = req.headers.authorization || '';
  const bearerMatch = header.match(/^Bearer\s+(.+)$/i);
  const token = bearerMatch?.[1]?.trim() || '';

  if (!token) {
    console.warn('[AUTH] Token Firebase ausente.', {
      method: req.method,
      path: req.originalUrl,
      hasAuthorizationHeader: Boolean(header),
    });
    return null;
  }

  const decoded = await verifyWithFirebaseAdmin(token);
  const id = normalizeOptionalString(decoded?.uid || decoded?.user_id || decoded?.sub);

  if (!id) {
    return null;
  }

  return {
    id,
    email: normalizeOptionalString(decoded?.email),
    name: normalizeOptionalString(decoded?.name || decoded?.displayName),
  };
}

function requireFirebaseAuth(req, res, next) {
  getAuthenticatedUserFromRequest(req)
    .then((user) => {
      if (!user) {
        return res.status(401).json({
          error: 'Token Firebase ausente o invalido.',
        });
      }

      req.authUser = user;
      return next();
    })
    .catch((error) => {
      console.warn('[AUTH] Token Firebase rechazado.', {
        method: req.method,
        path: req.originalUrl,
        code: error?.code || 'unknown',
        name: error?.name || 'Error',
        message: error?.message || 'Token invalido.',
      });
      return res.status(401).json({
        error: 'Token Firebase ausente o invalido.',
      });
    });
}

module.exports = {
  getAuthenticatedUserFromRequest,
  requireFirebaseAuth,
};
