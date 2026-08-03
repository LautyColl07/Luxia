const express = require('express');

const { getFirestore } = require('../lib/firebaseAdmin');
const prisma = require('../lib/prisma');
const { authRateLimit } = require('../lib/rateLimit');
const { requireFirebaseAuth } = require('../middleware/firebaseAuth');

const router = express.Router();

const GENERIC_RESOLVE_MESSAGE = 'No pudimos resolver el usuario ingresado';
const MAX_IDENTIFIER_LENGTH = 160;
const MAX_PROFILE_FIELD_LENGTH = 191;
const USER_SCAN_LIMIT = Number(process.env.AUTH_USERNAME_SCAN_LIMIT || 250);

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function looksLikeEmail(value) {
  return value.includes('@');
}

function normalizeUsername(value) {
  return normalizeString(value).toLowerCase();
}

function sanitizeEmail(value) {
  const normalizedEmail = normalizeString(value);
  return normalizedEmail || null;
}

function getSafeResolveFailure(res, status = 404) {
  return res.status(status).json({
    success: false,
    message: GENERIC_RESOLVE_MESSAGE,
  });
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

async function findEmailByUsername(db, normalizedUsername) {
  const directQueries = [
    ['usernameLowercase', normalizedUsername],
    ['normalizedUsername', normalizedUsername],
    ['username', normalizedUsername],
  ];

  for (const [field, value] of directQueries) {
    const snapshot = await db.collection('users').where(field, '==', value).limit(1).get();

    if (!snapshot.empty) {
      const userData = snapshot.docs[0].data() || {};
      const email = sanitizeEmail(userData.email);

      if (email) {
        return email;
      }
    }
  }

  const scanSnapshot = await db
    .collection('users')
    .select('email', 'username', 'usernameLowercase', 'normalizedUsername')
    .limit(USER_SCAN_LIMIT)
    .get();

  const matchedDoc = scanSnapshot.docs.find((doc) => {
    const data = doc.data() || {};
    const candidates = [
      data.usernameLowercase,
      data.normalizedUsername,
      data.username,
    ];

    return candidates.some((candidate) => normalizeUsername(candidate) === normalizedUsername);
  });

  if (!matchedDoc) {
    return null;
  }

  return sanitizeEmail(matchedDoc.data()?.email);
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

router.post('/resolve-login', async (req, res) => {
  const rawIdentifier = normalizeString(req.body?.identifier);

  if (!rawIdentifier || rawIdentifier.length > MAX_IDENTIFIER_LENGTH) {
    return getSafeResolveFailure(res, 400);
  }

  const isEmail = looksLikeEmail(rawIdentifier);
  const normalizedIdentifier = isEmail
    ? rawIdentifier
    : normalizeUsername(rawIdentifier);

  console.log('[LOGIN] resolviendo usuario');

  try {
    if (isEmail) {
      console.log('[LOGIN] usuario resuelto', true);
      return res.json({
        success: true,
        email: rawIdentifier,
      });
    }

    const db = getFirestore();
    const email = await findEmailByUsername(db, normalizedIdentifier);

    console.log('[LOGIN] usuario resuelto', Boolean(email));

    if (!email) {
      return getSafeResolveFailure(res, 404);
    }

    return res.json({
      success: true,
      email,
    });
  } catch (error) {
    console.error('[LOGIN] No se pudo resolver el usuario.');
    return getSafeResolveFailure(res, 500);
  }
});

module.exports = router;
