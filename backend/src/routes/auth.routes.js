const express = require('express');

const prisma = require('../lib/prisma');
const { authRateLimit } = require('../lib/rateLimit');
const { requireFirebaseAuth } = require('../middleware/firebaseAuth');

const router = express.Router();

const MAX_PROFILE_FIELD_LENGTH = 191;

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeEmail(value) {
  const normalizedEmail = normalizeString(value);
  return normalizedEmail || null;
}

function sendAuthError(res, status, error) {
  return res.status(status).json({ error });
}

function validateOptionalProfileField(body, field) {
  const value = body?.[field];

  if (value === undefined || value === null || value === '') {
    return { value: null };
  }

  if (typeof value !== 'string') {
    return { error: `${field} debe ser texto.` };
  }

  const normalized = value.trim();

  if (normalized.length > MAX_PROFILE_FIELD_LENGTH) {
    return {
      error: `${field} no puede superar ${MAX_PROFILE_FIELD_LENGTH} caracteres.`,
    };
  }

  return { value: normalized || null };
}

function validateRegisterBody(body) {
  if (body !== undefined && body !== null && (typeof body !== 'object' || Array.isArray(body))) {
    return { error: 'El cuerpo de la solicitud debe ser un objeto JSON.' };
  }

  const source = body || {};
  const fields = ['name', 'displayName', 'firstName', 'lastName'];
  const values = {};

  for (const field of fields) {
    const result = validateOptionalProfileField(source, field);

    if (result.error) {
      return { error: result.error };
    }

    values[field] = result.value;
  }

  const composedName = [values.firstName, values.lastName].filter(Boolean).join(' ');

  if (composedName.length > MAX_PROFILE_FIELD_LENGTH) {
    return {
      error: `El nombre completo no puede superar ${MAX_PROFILE_FIELD_LENGTH} caracteres.`,
    };
  }

  return {
    name: values.name || values.displayName || composedName || null,
  };
}

function validateAuthenticatedIdentity(authUser) {
  const id = normalizeString(authUser?.id);
  const email = sanitizeEmail(authUser?.email);
  const tokenName = normalizeString(authUser?.name);

  if (!id || id.length > MAX_PROFILE_FIELD_LENGTH) {
    return { error: 'El UID Firebase validado no es valido.' };
  }

  if (email && email.length > MAX_PROFILE_FIELD_LENGTH) {
    return { error: 'El email Firebase supera la longitud permitida.' };
  }

  if (tokenName.length > MAX_PROFILE_FIELD_LENGTH) {
    return { error: 'El nombre Firebase supera la longitud permitida.' };
  }

  return {
    email,
    id,
    name: tokenName || null,
  };
}

function toSafeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function isUniqueConflict(error) {
  return error?.code === 'P2002';
}

router.post('/register', requireFirebaseAuth, authRateLimit, async (req, res) => {
  const identity = validateAuthenticatedIdentity(req.authUser);

  if (identity.error) {
    return sendAuthError(res, 400, identity.error);
  }

  const profile = validateRegisterBody(req.body);

  if (profile.error) {
    return sendAuthError(res, 400, profile.error);
  }

  const name = profile.name || identity.name;

  try {
    if (identity.email) {
      const emailOwner = await prisma.user.findFirst({
        select: { id: true },
        where: {
          email: identity.email,
          NOT: { id: identity.id },
        },
      });

      if (emailOwner) {
        return sendAuthError(
          res,
          409,
          'El email Firebase ya esta asociado a otro perfil local.'
        );
      }
    }

    const existingUser = await prisma.user.findUnique({
      select: { id: true },
      where: { id: identity.id },
    });
    const user = await prisma.user.upsert({
      create: {
        id: identity.id,
        email: identity.email,
        name,
      },
      update: {
        ...(identity.email ? { email: identity.email } : {}),
        ...(name ? { name } : {}),
      },
      where: { id: identity.id },
    });

    return res.status(existingUser ? 200 : 201).json(toSafeUser(user));
  } catch (error) {
    if (isUniqueConflict(error)) {
      return sendAuthError(res, 409, 'El perfil local entra en conflicto con un usuario existente.');
    }

    console.error('[AUTH] No se pudo registrar el perfil local.');
    return sendAuthError(res, 500, 'No se pudo guardar el perfil local.');
  }
});

router.get('/me', requireFirebaseAuth, async (req, res) => {
  const identity = validateAuthenticatedIdentity(req.authUser);

  if (identity.error) {
    return sendAuthError(res, 400, identity.error);
  }

  try {
    const user = await prisma.user.findUnique({
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
      where: { id: identity.id },
    });

    if (!user) {
      return sendAuthError(res, 404, 'El perfil local todavia no existe.');
    }

    return res.json(toSafeUser(user));
  } catch (error) {
    console.error('[AUTH] No se pudo consultar el perfil local.');
    return sendAuthError(res, 500, 'No se pudo consultar el perfil local.');
  }
});

module.exports = router;
