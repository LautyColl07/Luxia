const express = require('express');

const { getFirestore } = require('../lib/firebaseAdmin');

const router = express.Router();

const GENERIC_RESOLVE_MESSAGE = 'No pudimos resolver el usuario ingresado';
const MAX_IDENTIFIER_LENGTH = 160;
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
    console.error('[LOGIN] Error resolviendo usuario:', error?.message || error);
    return getSafeResolveFailure(res, 500);
  }
});

module.exports = router;
