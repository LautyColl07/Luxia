const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function evaluateCaptureMode(value) {
  const source = readSource('src/config/captureMode.js');
  const transformed = babel.transformSync(source, {
    filename: 'captureMode.js',
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const module = { exports: {} };
  const env = value === undefined ? {} : { EXPO_PUBLIC_CAPTURE_MODE: value };

  vm.runInNewContext(transformed, {
    module,
    exports: module.exports,
    process: { env },
  });

  return module.exports.IS_CAPTURE_MODE;
}

test('el modo captura solo se activa con el valor exacto true', () => {
  assert.equal(evaluateCaptureMode('true'), true);
  assert.equal(evaluateCaptureMode('TRUE'), false);
  assert.equal(evaluateCaptureMode('1'), false);
  assert.equal(evaluateCaptureMode('false'), false);
  assert.equal(evaluateCaptureMode(undefined), false);
});

test('el modo captura usa mocks, evita tokens y no inicializa Firebase', () => {
  const apiSource = readSource('src/services/api.js');
  const authSource = readSource('src/context/AuthContext.tsx');
  const firebaseSource = readSource('src/config/firebase.ts');

  assert.match(apiSource, /export const USE_MOCKS = IS_CAPTURE_MODE/);
  assert.match(apiSource, /if \(IS_CAPTURE_MODE\)[\s\S]*CAPTURE_MODE/);
  assert.match(authSource, /IS_CAPTURE_MODE \? CAPTURE_USER/);
  assert.match(firebaseSource, /const app = !IS_CAPTURE_MODE && firebaseConfig/);
});
