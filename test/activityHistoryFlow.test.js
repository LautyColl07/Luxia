const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');

function loadActivityService(requestImplementation) {
  const servicePath = path.join(root, 'src/services/activityService.js');
  const source = fs.readFileSync(servicePath, 'utf8');
  const transformed = babel.transformSync(source, {
    filename: servicePath,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const module = { exports: {} };

  vm.runInNewContext(transformed, {
    Date,
    Error,
    JSON,
    Number,
    Object,
    Promise,
    Set,
    String,
    module,
    exports: module.exports,
    require: (request) => {
      if (request === './api') return { request: requestImplementation };
      throw new Error(`Modulo no esperado en la prueba: ${request}`);
    },
  });

  return module.exports;
}

test('el historial interpreta items paginados, conserva IDs string y ordena del mas reciente al mas antiguo', async () => {
  const calls = [];
  const activityService = loadActivityService(async (endpoint) => {
    calls.push(endpoint);
    if (endpoint.includes('page=1')) {
      return {
        items: [{ id: 'cuid-antiguo', type: 'lux', createdAt: '2026-08-01T00:00:00.000Z' }],
        total: 2,
        page: 1,
        limit: 100,
        totalPages: 2,
      };
    }
    return {
      items: [{ id: 'uuid-reciente', type: 'lux', createdAt: '2026-08-02T00:00:00.000Z' }],
      total: 2,
      page: 2,
      limit: 100,
      totalPages: 2,
    };
  });

  const activities = await activityService.getActivityHistory();
  assert.equal(calls.length, 2);
  assert.deepEqual(Array.from(activities, (item) => item.id), ['uuid-reciente', 'cuid-antiguo']);
  assert.equal(typeof activities[0].id, 'string');
});

test('una respuesta HTTP fallida o un contrato invalido no se convierte en un historial vacio', async () => {
  const rejectedService = loadActivityService(async () => {
    const error = new Error('Sin autorizacion');
    error.status = 401;
    throw error;
  });
  await assert.rejects(rejectedService.getActivityHistory(), { status: 401 });

  const invalidContractService = loadActivityService(async () => ({ success: true, data: { unexpected: true } }));
  await assert.rejects(invalidContractService.getActivityHistory(), /formato valido/);
});

test('el estado vacio solo resulta de una respuesta exitosa sin elementos', async () => {
  const activityService = loadActivityService(async () => ({
    items: [],
    total: 0,
    page: 1,
    limit: 100,
    totalPages: 1,
  }));

  assert.equal(Array.from(await activityService.getActivityHistory()).length, 0);
});

test('ActivityHistoryScreen vuelve a cargar mediante useFocusEffect y mantiene un estado de error separado', () => {
  const screenSource = fs.readFileSync(path.join(root, 'src/screens/ActivityHistoryScreen.js'), 'utf8');
  assert.match(screenSource, /useFocusEffect\(/);
  assert.match(screenSource, /void loadActivity\(\)/);
  assert.match(screenSource, /if \(error && !activities\.length\)/);
});

test('LUX usa el backend autenticado y bloquea doble envio desde el modal', () => {
  const apiSource = fs.readFileSync(path.join(root, 'src/services/api.js'), 'utf8');
  const modalSource = fs.readFileSync(path.join(root, 'src/components/LuxAssistantModal.js'), 'utf8');

  assert.match(apiSource, /request\('\/lux\/chat'/);
  assert.match(apiSource, /\.\.\.getActiveWorkContextQuery\(\)/);
  assert.doesNotMatch(apiSource, /AI_BASE_URL/);
  assert.match(modalSource, /if \(!text \|\| isSending \|\| isStreaming\)/);
  assert.match(modalSource, /disabled=\{!input\.trim\(\) \|\| isSending \|\| isStreaming\}/);
});
