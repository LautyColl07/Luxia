const admin = require('firebase-admin');

let initialized = false;

function getCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
  }

  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    return admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
  }

  throw new Error('Faltan credenciales de Firebase Admin.');
}

function getFirebaseAdmin() {
  if (!initialized) {
    admin.initializeApp({
      credential: getCredential(),
    });
    initialized = true;
  }

  return admin;
}

async function verifyFirebaseIdToken(token) {
  return getFirebaseAdmin().auth().verifyIdToken(token);
}

module.exports = {
  getFirebaseAdmin,
  verifyFirebaseIdToken,
};
