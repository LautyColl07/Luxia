const assert = require('node:assert/strict');
const test = require('node:test');

const { validateAudioFile, validateDocumentFile } = require('../src/lib/fileValidation');

function createDocxLikeZip(entryNames) {
  const localHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  const directoryEntries = entryNames.map((name) => {
    const encodedName = Buffer.from(name);
    const entry = Buffer.alloc(46 + encodedName.length);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(encodedName.length, 28);
    encodedName.copy(entry, 46);
    return entry;
  });
  const directory = Buffer.concat(directoryEntries);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entryNames.length, 8);
  end.writeUInt16LE(entryNames.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(localHeader.length, 16);
  return Buffer.concat([localHeader, directory, end]);
}

test('acepta un PDF cuya extension, MIME y firma coinciden', async () => {
  const result = await validateDocumentFile({
    buffer: Buffer.from('%PDF-1.7\n'),
    mimetype: 'application/pdf',
    originalname: 'documento.pdf',
  });

  assert.equal(result.mimeType, 'application/pdf');
});

test('rechaza un PDF declarado cuya firma no coincide', async () => {
  await assert.rejects(
    validateDocumentFile({
      buffer: Buffer.from('contenido sin firma'),
      mimetype: 'application/pdf',
      originalname: 'documento.pdf',
    }),
    { status: 415 }
  );
});

test('acepta audio M4A con MIME generico cuando su firma y extension coinciden', async () => {
  const result = await validateAudioFile({
    buffer: Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from('ftypM4A ')]),
    mimetype: 'application/octet-stream',
    originalname: 'audio.m4a',
  });

  assert.equal(result.mimeType, 'audio/mp4');
});

test('rechaza una extension peligrosa aunque declare MIME de audio', async () => {
  await assert.rejects(
    validateAudioFile({
      buffer: Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from('ftypM4A ')]),
      mimetype: 'audio/mp4',
      originalname: 'audio.exe',
    }),
    { status: 415 }
  );
});

test('rechaza un ZIP que no contiene la estructura minima de DOCX', async () => {
  await assert.rejects(
    validateDocumentFile({
      buffer: createDocxLikeZip(['archivo-arbitrario']),
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      originalname: 'archivo.docx',
    }),
    { status: 415 }
  );
});

test('acepta DOCX solo con contenedor ZIP y estructura Word minima', async () => {
  const result = await validateDocumentFile({
    buffer: createDocxLikeZip(['[Content_Types].xml', 'word/document.xml']),
    mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    originalname: 'escrito.docx',
  });

  assert.equal(result.mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
});
