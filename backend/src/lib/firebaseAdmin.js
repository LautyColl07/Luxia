let cachedAdmin = null;
const DEFAULT_FIREBASE_PROJECT_ID = 'luxia-app';

function parseServiceAccount(rawValue) {
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    const configError = new Error('FIREBASE_SERVICE_ACCOUNT_JSON no contiene JSON valido.');
    configError.code = 'auth/invalid-admin-config';
    configError.cause = error;
    throw configError;
  }
}

function resolveFirebaseAdminConfig(env = process.env) {
  const serviceAccount = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const serviceAccountProjectId = serviceAccount?.project_id || null;
  const configuredProjectId =
    env.FIREBASE_PROJECT_ID ||
    env.GOOGLE_CLOUD_PROJECT ||
    env.GCLOUD_PROJECT ||
    DEFAULT_FIREBASE_PROJECT_ID;

  if (configuredProjectId && serviceAccountProjectId && configuredProjectId !== serviceAccountProjectId) {
    const error = new Error(
      'FIREBASE_PROJECT_ID no coincide con el project_id de la cuenta de servicio.'
    );
    error.code = 'auth/project-config-mismatch';
    throw error;
  }

  return {
    projectId: configuredProjectId || serviceAccountProjectId,
    serviceAccount,
  };
}

function getFirebaseAdmin() {
  if (cachedAdmin) {
    return cachedAdmin;
  }

  const admin = require('firebase-admin');

  if (!admin.apps.length) {
    const config = resolveFirebaseAdminConfig();

    if (config.serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(config.serviceAccount),
        ...(config.projectId ? { projectId: config.projectId } : {}),
      });
    } else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        ...(config.projectId ? { projectId: config.projectId } : {}),
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
  resolveFirebaseAdminConfig,
};
