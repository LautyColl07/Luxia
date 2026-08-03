const assert = require('node:assert/strict');
const test = require('node:test');

const { validateAudioFile, validateDocumentFile } = require('../src/lib/fileValidation');

test('acepta un PDF cuya extension, MIME y firma coinciden', () => {
  const result = validateDocumentFile({
    buffer: Buffer.from('%PDF-1.7\n'),
    mimetype: 'application/pdf',
    originalname: 'documento.pdf',
  });

  assert.equal(result.mimeType, 'application/pdf');
});

test('rechaza un PDF declarado cuya firma no coincide', () => {
  assert.throws(
    () => validateDocumentFile({
      buffer: Buffer.from('contenido sin firma'),
      mimetype: 'application/pdf',
      originalname: 'documento.pdf',
    }),
    { status: 415 }
  );
});

test('acepta audio M4A con MIME generico cuando su firma y extension coinciden', () => {
  const result = validateAudioFile({
    buffer: Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from('ftypM4A ')]),
    mimetype: 'application/octet-stream',
    originalname: 'audio.m4a',
  });

  assert.equal(result.mimeType, 'audio/mp4');
});

test('rechaza una extension peligrosa aunque declare MIME de audio', () => {
  assert.throws(
    () => validateAudioFile({
      buffer: Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from('ftypM4A ')]),
      mimetype: 'audio/mp4',
      originalname: 'audio.exe',
    }),
    { status: 415 }
  );
});
