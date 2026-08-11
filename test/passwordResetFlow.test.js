const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('la pantalla de recuperacion usa el cliente centralizado y no confirma un envio fallido', () => {
  const screenSource = fs.readFileSync(path.join(root, 'src/screens/ForgotPasswordScreen.tsx'), 'utf8');
  const clientSource = fs.readFileSync(path.join(root, 'src/services/authClient.ts'), 'utf8');

  assert.match(screenSource, /authClient\.resetPassword\(trimmedEmail\)/);
  assert.doesNotMatch(screenSource, /sendPasswordResetEmail/);
  assert.match(screenSource, /setError\(/);
  assert.match(clientSource, /await sendPasswordResetEmail\(auth, normalizedEmail\)/);
  assert.match(clientSource, /auth\/user-not-found/);
});
