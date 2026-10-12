const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function loadApi(fetchImplementation) {
  const apiPath = path.join(root, 'src/services/api.js');
  const transformed = babel.transformSync(read('src/services/api.js'), {
    filename: apiPath,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const module = { exports: {} };
  const tokenCalls = [];
  let signOutCalls = 0;
  const currentUser = {
    getIdToken: async (forceRefresh) => {
      tokenCalls.push(Boolean(forceRefresh));
      return forceRefresh ? 'fresh-test-token' : 'cached-test-token';
    },
  };
  const localRequire = (request) => {
    if (request === '../config/api') {
      return { API_BASE_URL: 'https://api.test/api/v1', API_ROOT_URL: 'https://api.test' };
    }
    if (request === '../config/captureMode') return { IS_CAPTURE_MODE: false };
    if (request === '../config/firebase') {
      return { auth: { currentUser }, firebaseConfig: { projectId: 'luxia-app' } };
    }
    if (request === 'firebase/auth') {
      return { signOut: async () => { signOutCalls += 1; } };
    }
    if (request === '../data/mockData') return [];
    if (request === '../utils/status') return { normalizeStatusLabel: (value) => value };
    if (request === '../utils/userDisplay') {
      return {
        getUserDisplayName: () => 'Usuario',
        getUserEmail: () => 'usuario@example.test',
        getUserRole: () => 'Profesional',
      };
    }
    throw new Error(`Modulo no esperado: ${request}`);
  };

  vm.runInNewContext(transformed, {
    AbortController,
    Date,
    FormData,
    JSON,
    Map,
    Number,
    Object,
    Promise,
    String,
    URLSearchParams,
    clearTimeout,
    console: { error: () => undefined, info: () => undefined, log: () => undefined, warn: () => undefined },
    fetch: fetchImplementation,
    module,
    exports: module.exports,
    require: localRequire,
    setTimeout,
  });

  return { api: module.exports, getSignOutCalls: () => signOutCalls, tokenCalls };
}

test('el dashboard espera la sincronizacion y StudyContext espera autenticacion', () => {
  const app = read('App.tsx');
  const auth = read('src/context/AuthContext.tsx');
  const studies = read('src/context/StudyContext.tsx');

  assert.match(app, /authStatus === "synchronizing"/);
  assert.match(app, /currentUser && authStatus === "authenticated"/);
  assert.match(auth, /setAuthStatus\("synchronizing"\)/);
  assert.match(auth, /syncPromise[\s\S]*setAuthStatus\("authenticated"\)/);
  assert.match(studies, /authStatus !== "authenticated"/);
});

test('un 401 de register queda visible y no es ocultado por el cliente API', () => {
  const api = read('src/services/api.js');
  const auth = read('src/context/AuthContext.tsx');
  const login = read('src/screens/LoginScreen.tsx');

  assert.match(api, /logoutOnUnauthorized: false/);
  assert.match(auth, /status === 401 \|\| status === 403/);
  assert.match(auth, /servidor rechazo la sesion/);
  assert.match(login, /accessibilityRole="alert"/);
  assert.match(login, /submitError/);
});

test('un fallo recuperable no deja el login bloqueado ni omite controles del backend', () => {
  const auth = read('src/context/AuthContext.tsx');
  const authClient = read('src/services/authClient.ts');
  const api = read('src/services/api.js');

  assert.match(auth, /network\/5xx failure/);
  assert.match(auth, /setSyncStatus\("warning"\)/);
  assert.match(auth, /REGISTER_SYNC_GATE_MS = 4000/);
  assert.match(auth, /limitRegisterSyncWait/);
  assert.match(api, /PROTECTED_ENDPOINT_PREFIXES/);
  assert.match(api, /currentUser\.getIdToken\(forceRefresh\)/);
  assert.match(api, /REGISTER_SYNC_TIMEOUT_MS = 4000/);
  assert.match(authClient, /getDocFromCache/);
  assert.doesNotMatch(authClient, /await getDoc\(/);
});

test('register reintenta una sola vez con token fresco y deja que AuthContext maneje el 401', async () => {
  let requestCount = 0;
  const harness = loadApi(async () => {
    requestCount += 1;
    return jsonResponse(401, { errorCode: 'AUTH_TOKEN_INVALID' });
  });
  harness.api.setAuthState('authenticated');

  await assert.rejects(harness.api.syncRegister({}), (error) => error.status === 401);
  assert.equal(requestCount, 2);
  assert.deepEqual(harness.tokenCalls, [false, true]);
  assert.equal(harness.getSignOutCalls(), 0);
});

test('los recursos protegidos cierran una sesion rechazada despues del unico reintento', async () => {
  const harness = loadApi(async () => jsonResponse(401, { errorCode: 'AUTH_TOKEN_EXPIRED' }));
  harness.api.setAuthState('authenticated');

  await assert.rejects(harness.api.getMyLegalStudies(), (error) => error.status === 401);
  assert.equal(harness.getSignOutCalls(), 1);
});

test('un backend inaccesible se informa como error de conexion', async () => {
  const harness = loadApi(async () => {
    throw new TypeError('Failed to fetch');
  });
  harness.api.setAuthState('authenticated');

  await assert.rejects(
    harness.api.syncRegister({}),
    (error) => error.status === 0 && /conectarnos/i.test(error.message)
  );
});

test('el login distingue credenciales, red, autorizacion y conserva sesion segun plataforma', () => {
  const authClient = read('src/services/authClient.ts');
  const firebase = read('src/config/firebase.ts');

  assert.match(authClient, /auth\/invalid-credential/);
  assert.match(authClient, /auth\/network-request-failed/);
  assert.match(authClient, /auth\/user-disabled/);
  assert.match(authClient, /Platform\.OS === "web"/);
  assert.match(authClient, /browserLocalPersistence/);
  assert.match(authClient, /browserSessionPersistence/);
  assert.match(firebase, /getReactNativePersistence/);
  assert.match(authClient, /Perfil de Firestore no disponible/);
});
