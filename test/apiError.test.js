import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeApiErrorPayload } from '../src/utils/apiError.js';

test('normalizes nested backend errors to a safe code and readable message', () => {
  assert.deepEqual(normalizeApiErrorPayload({
    success: false,
    error: { code: 'EMAIL_NOT_VERIFIED', message: 'Verificá tu correo para continuar.' },
  }), {
    code: 'EMAIL_NOT_VERIFIED',
    message: 'Verificá tu correo para continuar.',
  });
});

test('keeps compatibility with string errors and bounds diagnostic fields', () => {
  assert.deepEqual(normalizeApiErrorPayload({ error: 'Error anterior' }), { code: null, message: 'Error anterior' });
  assert.equal(normalizeApiErrorPayload({ code: 'A'.repeat(100), message: 'B'.repeat(300) }).code.length, 80);
  assert.equal(normalizeApiErrorPayload({ code: 'CODE', message: 'B'.repeat(300) }).message.length, 240);
});
