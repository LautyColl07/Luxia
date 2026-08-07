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

test('LEGAL usa exclusivamente legal/query y GENERAL usa lux/chat', () => {
  assert.match(modalSource, /chatMode === CHAT_MODE\.LEGAL/);
  assert.match(modalSource, /sendLegalLuxQuery\(body\)/);
  assert.match(modalSource, /chatMode === CHAT_MODE\.GENERAL/);
  assert.match(modalSource, /sendGeneralLuxMessage\(text, context\)/);
  assert.doesNotMatch(modalSource, /sendLegalLuxQuery\(\{[^}]*context/);
  assert.match(apiSource, /request\('\/lux\/legal\/query'/);
  assert.match(apiSource, /request\('\/lux\/chat'/);
});

test('el body legal solo contiene question y conversationId', () => {
  assert.match(modalSource, /const body = \{ question: text, conversationId: legalConversationIdRef\.current \}/);
  assert.match(apiSource, /body: \{\s*question: normalizedQuestion,\s*\.\.\.\(safeOptionalString\(conversationId\)/s);
  assert.doesNotMatch(modalSource, /sendLegalLuxQuery\([^)]*context/);
});
