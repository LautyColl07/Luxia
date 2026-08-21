const { getFirebaseAdmin } = require('../lib/firebaseAdmin');

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function decodeJwtPayload(token) {
  const [, payload] = String(token || '').split('.');

  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

async function verifyWithFirebaseAdmin(token) {
  try {
    const admin = getFirebaseAdmin();
    return admin.auth().verifyIdToken(token);
  } catch (error) {
    if (process.env.FIREBASE_AUTH_STRICT === 'true') {
      throw error;
    }

    return null;
  }
}

async function getAuthenticatedUserFromRequest(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    return null;
  }

  const verified = await verifyWithFirebaseAdmin(token);
  const decoded = verified || decodeJwtPayload(token);
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
