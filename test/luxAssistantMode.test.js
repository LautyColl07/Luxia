const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const modalSource = fs.readFileSync(path.join(root, 'src/components/LuxAssistantModal.js'), 'utf8');
const apiSource = fs.readFileSync(path.join(root, 'src/services/api.js'), 'utf8');

test('el modal inicia en LEGAL y mantiene tabs, historiales y saludos separados', () => {
  assert.match(modalSource, /export const CHAT_MODE = \{ GENERAL: 'GENERAL', LEGAL: 'LEGAL' \}/);
  assert.match(modalSource, /useState\(CHAT_MODE\.LEGAL\)/);
  assert.match(modalSource, /\[CHAT_MODE\.GENERAL\]/);
  assert.match(modalSource, /\[CHAT_MODE\.LEGAL\]/);
  assert.match(modalSource, /setChatMode\(nextMode\)/);
  assert.match(modalSource, /GENERAL_WELCOME/);
  assert.match(modalSource, /LEGAL_WELCOME/);
});

test('LEGAL y GENERAL usan el endpoint autenticado lux/chat', () => {
  assert.match(modalSource, /chatMode === CHAT_MODE\.LEGAL/);
  assert.match(modalSource, /chatMode === CHAT_MODE\.GENERAL/);
  assert.match(modalSource, /sendGeneralLuxMessage\(text, context\)/);
  assert.doesNotMatch(apiSource, /\/lux\/legal\/query/);
  assert.match(apiSource, /request\('\/lux\/chat'/);
});

test('la consulta legal adapta el mensaje al contrato de lux/chat', () => {
  assert.match(apiSource, /sendLuxMessage\(\s*normalizedQuestion,[\s\S]*mode: 'legal'/);
  assert.match(apiSource, /message: normalizedMessage/);
  assert.match(apiSource, /context: \{/);
});
