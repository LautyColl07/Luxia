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
  return admin.auth().verifyIdToken(token);
}

async function getAuthenticatedUserFromRequest(req) {
  const header = req.headers.authorization || '';
  const bearerMatch = header.match(/^Bearer\s+(.+)$/i);
  const token = bearerMatch?.[1]?.trim() || '';

  if (!token) {
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
      console.error('[AUTH] Error validando token Firebase:', error);
      return res.status(401).json({
        error: 'Token Firebase ausente o invalido.',
      });
    });
}

module.exports = {
  getAuthenticatedUserFromRequest,
  requireFirebaseAuth,
};
