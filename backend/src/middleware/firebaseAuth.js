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

function getUntrustedTokenAudience(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return normalizeOptionalString(payload?.aud);
  } catch {
    return null;
  }
}

function getPublicAuthError(error) {
  const code = String(error?.code || '');

  if (code === 'auth/id-token-expired') {
    return { status: 401, errorCode: 'AUTH_TOKEN_EXPIRED', error: 'La sesion Firebase expiro.' };
  }

  if (code === 'auth/id-token-revoked') {
    return { status: 401, errorCode: 'AUTH_TOKEN_REVOKED', error: 'La sesion Firebase fue revocada.' };
  }

  if (code === 'auth/project-config-mismatch' || code === 'auth/invalid-admin-config') {
    return {
      status: 500,
      errorCode: 'AUTH_SERVER_MISCONFIGURED',
      error: 'El servidor de autenticacion no esta configurado correctamente.',
    };
  }

  if (code.startsWith('app/') || code.startsWith('credential/')) {
    return {
      status: 500,
      errorCode: 'AUTH_SERVER_UNAVAILABLE',
      error: 'El servidor no pudo validar la sesion.',
    };
  }

  return { status: 401, errorCode: 'AUTH_TOKEN_INVALID', error: 'Token Firebase invalido.' };
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
  const header = req.headers.authorization || '';
  const bearerMatch = header.match(/^Bearer\s+(.+)$/i);
  const tokenAudience = bearerMatch?.[1]
    ? getUntrustedTokenAudience(bearerMatch[1].trim())
    : null;

  getAuthenticatedUserFromRequest(req)
    .then((user) => {
      if (!user) {
        return res.status(401).json({
          error: 'Token Firebase ausente o invalido.',
          errorCode: 'AUTH_TOKEN_MISSING',
        });
      }

      req.authUser = user;
      return next();
    })
    .catch((error) => {
      const publicError = getPublicAuthError(error);
      const admin = (() => {
        try {
          return getFirebaseAdmin();
        } catch {
          return null;
        }
      })();
      console.warn('[AUTH] Token Firebase rechazado.', {
        method: req.method,
        path: req.originalUrl,
        code: error?.code || 'unknown',
        name: error?.name || 'Error',
        expectedProjectId: admin?.app()?.options?.projectId || null,
        tokenAudience,
      });
      return res.status(publicError.status).json({
        error: publicError.error,
        errorCode: publicError.errorCode,
      });
    });
}

module.exports = {
  getAuthenticatedUserFromRequest,
  getPublicAuthError,
  getUntrustedTokenAudience,
  requireFirebaseAuth,
};
