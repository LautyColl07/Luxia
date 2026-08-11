const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('el backend no publica un endpoint que resuelva usuarios a correos', () => {
  const source = fs.readFileSync(path.join(root, 'src/routes/auth.routes.js'), 'utf8');
  const clientSource = fs.readFileSync(path.join(root, '..', 'src/services/authClient.ts'), 'utf8');

  assert.doesNotMatch(source, /resolve-login/);
  assert.doesNotMatch(clientSource, /resolve-login/);
  assert.match(clientSource, /emailForLogin\.includes\("@"\)/);
});
