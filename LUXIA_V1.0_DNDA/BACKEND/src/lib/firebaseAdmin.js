let cachedAdmin = null;

function getFirebaseAdmin() {
  if (cachedAdmin) {
    return cachedAdmin;
  }

  const admin = require('firebase-admin');

  if (!admin.apps.length) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (serviceAccountJson) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
      });
    } else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
    }
  }

  cachedAdmin = admin;
  return admin;
}

function getFirestore() {
  return getFirebaseAdmin().firestore();
}

module.exports = {
  getFirebaseAdmin,
  getFirestore,
};
