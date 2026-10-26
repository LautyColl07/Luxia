const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');

function loadConfig({ platform = 'web', env = {} } = {}) {
  const configPath = path.join(root, 'src/config/api.js');
  const transformed = babel.transformSync(fs.readFileSync(configPath, 'utf8'), {
    filename: configPath,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const module = { exports: {} };

  vm.runInNewContext(transformed, {
    module,
    exports: module.exports,
    process: { env },
    require(name) {
      if (name === 'react-native') return { Platform: { OS: platform } };
      throw new Error(`Unexpected api config import: ${name}`);
    },
  });

  return module.exports;
}

test('la configuración Docker usa la raíz de API publicada por Nginx', () => {
  const config = loadConfig();
  const urls = config.buildServerUrls('25.1.22.89');

  assert.equal(urls.API_ROOT_URL, 'http://25.1.22.89:8080');
  assert.equal(urls.API_BASE_URL, 'http://25.1.22.89:8080/api/v1');
  assert.equal(urls.AI_BASE_URL, 'http://25.1.22.89:8080');
  assert.equal(urls.SOCKET_URL, 'http://25.1.22.89:8080');

  for (const endpoint of [
    '/auth/me',
    '/cases',
    '/documentos',
    '/audiencias',
    '/lux/chat',
  ]) {
    assert.equal(`${urls.API_BASE_URL}${endpoint}`.startsWith('http://25.1.22.89:8080/api/v1/'), true);
  }
});

test('web y simulador Android usan el host correcto por defecto', () => {
  const webConfig = loadConfig({ platform: 'web' });
  const androidConfig = loadConfig({ platform: 'android' });

  assert.equal(webConfig.API_ROOT_URL, 'http://localhost:8080');
  assert.equal(androidConfig.API_ROOT_URL, 'http://10.0.2.2:8080');
  assert.equal(androidConfig.API_BASE_URL, 'http://10.0.2.2:8080/api/v1');
});

test('EXPO_PUBLIC_API_ROOT_URL permite configurar otro host', () => {
  const config = loadConfig({
    platform: 'android',
    env: { EXPO_PUBLIC_API_ROOT_URL: 'http://192.168.1.50:8080/' },
  });

  assert.equal(config.API_ROOT_URL, 'http://192.168.1.50:8080');
  assert.equal(config.API_BASE_URL, 'http://192.168.1.50:8080/api/v1');
});

test('las constantes públicas derivan de la misma raíz', () => {
  const config = loadConfig({ platform: 'web' });
  const urls = config.buildServerUrls(config.SERVER_IP);

  assert.equal(config.API_ROOT_URL, urls.API_ROOT_URL);
  assert.equal(config.API_BASE_URL, urls.API_BASE_URL);
  assert.equal(config.AI_BASE_URL, urls.AI_BASE_URL);
  assert.equal(config.SOCKET_URL, urls.SOCKET_URL);
});
