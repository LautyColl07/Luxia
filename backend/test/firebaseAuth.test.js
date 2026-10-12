const assert = require('node:assert/strict');
const test = require('node:test');

const { resolveFirebaseAdminConfig } = require('../src/lib/firebaseAdmin');
const {
  getPublicAuthError,
  getUntrustedTokenAudience,
} = require('../src/middleware/firebaseAuth');

function unsignedToken(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode(payload)}.`;
}

test('Firebase Admin rechaza una cuenta de servicio de otro proyecto', () => {
  assert.throws(
    () => resolveFirebaseAdminConfig({
      FIREBASE_PROJECT_ID: 'luxia-app',
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'otro-proyecto' }),
    }),
    (error) => error.code === 'auth/project-config-mismatch'
  );
});

test('Firebase Admin usa el mismo proyecto configurado por el frontend', () => {
  const config = resolveFirebaseAdminConfig({
    FIREBASE_PROJECT_ID: 'luxia-app',
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'luxia-app' }),
  });

  assert.equal(config.projectId, 'luxia-app');
  assert.equal(resolveFirebaseAdminConfig({}).projectId, 'luxia-app');
});

test('el diagnostico extrae solo la audiencia y nunca registra el token', () => {
  const token = unsignedToken({ aud: 'luxia-app', sub: 'sensitive-user-id' });
  assert.equal(getUntrustedTokenAudience(token), 'luxia-app');
  assert.equal(getUntrustedTokenAudience('not-a-token'), null);
});

test('distingue token vencido, revocado, invalido y configuracion del servidor', () => {
  assert.deepEqual(getPublicAuthError({ code: 'auth/id-token-expired' }), {
    status: 401,
    errorCode: 'AUTH_TOKEN_EXPIRED',
    error: 'La sesion Firebase expiro.',
  });
  assert.equal(getPublicAuthError({ code: 'auth/id-token-revoked' }).errorCode, 'AUTH_TOKEN_REVOKED');
  assert.equal(getPublicAuthError({ code: 'auth/argument-error' }).errorCode, 'AUTH_TOKEN_INVALID');
  assert.equal(
    getPublicAuthError({ code: 'auth/project-config-mismatch' }).status,
    500
  );
});
