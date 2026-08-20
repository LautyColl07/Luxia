const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');

function loadConfig() {
  const configPath = path.join(root, 'src/config/api.js');
  const transformed = babel.transformSync(fs.readFileSync(configPath, 'utf8'), {
    filename: configPath,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const module = { exports: {} };

  vm.runInNewContext(transformed, {
    module,
    exports: module.exports,
  });

  return module.exports;
}

test('una sola SERVER_IP construye todas las URLs de infraestructura frontend', () => {
  const config = loadConfig();
  const urls = config.buildServerUrls('172.16.1.50');

  assert.equal(urls.API_ROOT_URL, 'http://172.16.1.50:3000');
  assert.equal(urls.API_BASE_URL, 'http://172.16.1.50:3000/api/v1');
  assert.equal(urls.AI_BASE_URL, 'http://172.16.1.50:5000');
  assert.equal(urls.SOCKET_URL, 'http://172.16.1.50:3000');

  for (const endpoint of [
    '/auth/me',
    '/cases',
    '/documentos',
    '/audiencias',
    '/lux/legal/query',
  ]) {
    assert.equal(`${urls.API_BASE_URL}${endpoint}`.startsWith('http://172.16.1.50:3000/api/v1/'), true);
  }
});

test('las constantes publicas actuales derivan del mismo host', () => {
  const config = loadConfig();
  const urls = config.buildServerUrls(config.SERVER_IP);

  assert.equal(config.API_ROOT_URL, urls.API_ROOT_URL);
  assert.equal(config.API_BASE_URL, urls.API_BASE_URL);
  assert.equal(config.AI_BASE_URL, urls.AI_BASE_URL);
  assert.equal(config.SOCKET_URL, urls.SOCKET_URL);
});
