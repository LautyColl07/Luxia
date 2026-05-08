const { verifyFirebaseIdToken } = require('../lib/firebaseAdmin');
const { ensureUserFromFirebase } = require('../services/userService');
const { unauthorized } = require('../utils/httpErrors');

async function requireAuth(req, res, next) {
  try {
    const authorizationHeader = req.headers.authorization || '';

    if (!authorizationHeader.startsWith('Bearer ')) {
      throw unauthorized('No autenticado.');
    }

    const idToken = authorizationHeader.slice('Bearer '.length).trim();

    if (!idToken) {
      throw unauthorized('No autenticado.');
    }

    const decodedToken = await verifyFirebaseIdToken(idToken);
    const user = await ensureUserFromFirebase(decodedToken);

    req.firebaseUser = decodedToken;
    req.user = user;
    next();
  } catch (error) {
    next(error.status ? error : unauthorized('No autenticado.'));
  }
}

module.exports = requireAuth;
