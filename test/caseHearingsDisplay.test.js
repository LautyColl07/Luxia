const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');

function loadModule(filename) {
  const fullPath = path.join(root, filename);
  const transformed = babel.transformSync(fs.readFileSync(fullPath, 'utf8'), {
    filename: fullPath,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const module = { exports: {} };
  vm.runInNewContext(transformed, { module, exports: module.exports, Date, Set, Number, String });
  return module.exports;
}

test('la pantalla agrupa por un solo instante, prioriza finalizadas y conserva la igualdad en próximas', () => {
  const { groupHearingsForDisplay } = loadModule('src/utils/caseHearings.js');
  const now = Date.parse('2026-11-19T12:00:00.000Z');
  const input = [
    { id: 'past', date: new Date(now - 2).toISOString() },
    { id: '10', date: new Date(now - 1).toISOString() },
    { id: '2', date: new Date(now - 1).toISOString() },
    { id: 'exact', date: new Date(now).toISOString() },
    { id: 'future', date: new Date(now + 1).toISOString() },
    { id: 'completed-future', date: new Date(now + 1000).toISOString(), completedAt: new Date(now - 1).toISOString() },
    { id: 'completed', date: new Date(now - 1000).toISOString(), completedAt: new Date(now + 500).toISOString() },
    { id: 'undated', date: null },
    { id: 'invalid', date: 'fecha inválida' },
  ];

  const result = groupHearingsForDisplay(input, now);

  assert.deepEqual(Array.from(result.inProgressHearings, ({ id }) => id), ['2', '10', 'past']);
  assert.deepEqual(Array.from(result.upcomingHearings, ({ id }) => id), ['exact', 'future']);
  assert.deepEqual(Array.from(result.recentHearings, ({ id }) => id), ['completed', 'completed-future']);
  assert.deepEqual(Array.from(result.undatedHearings, ({ id }) => id), ['invalid', 'undated']);
  assert.equal(input.length, 9);
});

test('el orden por fecha invierte solo las fechas y mantiene los registros sin fecha al final', () => {
  const { sortHearingsByDate } = loadModule('src/utils/caseHearings.js');
  const input = [
    { id: 'later', date: '2026-11-20T10:00:00.000Z' },
    { id: 'earlier', date: '2026-11-20T09:00:00.000Z' },
    { id: 'undated', date: null },
  ];

  assert.deepEqual(Array.from(sortHearingsByDate(input, 'date', 'newest', true), ({ id }) => id), ['later', 'earlier', 'undated']);
  assert.deepEqual(Array.from(sortHearingsByDate(input, 'date', 'oldest', true), ({ id }) => id), ['earlier', 'later', 'undated']);
  assert.deepEqual(input.map(({ id }) => id), ['later', 'earlier', 'undated']);
});

test('StatusBadge muestra En Curso y Sin fecha con tonos legibles y Finalizada en peligro', () => {
  const { getStatusTone, normalizeStatusLabel } = loadModule('src/utils/status.js');

  assert.equal(normalizeStatusLabel('En Curso'), 'En Curso');
  assert.equal(getStatusTone('En Curso'), 'warning');
  assert.equal(normalizeStatusLabel('Sin fecha'), 'Sin fecha');
  assert.equal(getStatusTone('Sin fecha'), 'neutral');
  assert.equal(normalizeStatusLabel('Finalizada'), 'Finalizada');
  assert.equal(getStatusTone('Finalizada'), 'danger');
});
