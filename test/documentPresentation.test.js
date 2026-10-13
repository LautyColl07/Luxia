const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const babel = require('@babel/core');

const filename = path.join(__dirname, '../src/utils/documentPresentation.js');
const moduleValue = { exports: {} };
vm.runInNewContext(babel.transformSync(fs.readFileSync(filename, 'utf8'), {
  filename, plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code, { module: moduleValue, exports: moduleValue.exports, URL });
const { getDocumentName, getDocumentFileKind, formatDocumentSize, getDocumentAssociation, getDocumentDownloadUrl } = moduleValue.exports;

test('el nombre original tiene prioridad sobre el nombre físico y conserva el fallback histórico', () => {
  assert.equal(getDocumentName({ originalName: 'Entrevista.pdf', filename: 'Alias.pdf', fileName: '1791893716436-Entrevista.pdf' }), 'Entrevista.pdf');
  assert.equal(getDocumentName({ filename: 'Listado.pdf', fileName: 'nombre-interno.pdf' }), 'Listado.pdf');
  assert.equal(getDocumentName({ fileName: 'histórico.docx' }), 'histórico.docx');
});

test('el MIME específico determina el icono aunque la extensión indique otro formato', () => {
  assert.equal(getDocumentFileKind({ mimeType: 'image/png', fileName: 'adjunto.pdf' }), 'image');
  assert.equal(getDocumentFileKind({ mimeType: 'application/msword', fileName: 'adjunto.pdf' }), 'doc');
  assert.equal(getDocumentFileKind({ mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'docx');
  assert.equal(getDocumentFileKind({ mimeType: 'text/plain; charset=utf-8', fileName: 'adjunto.pdf' }), 'txt');
  assert.equal(getDocumentFileKind({ mimeType: 'application/zip', fileName: 'adjunto.pdf' }), 'other');
  assert.equal(getDocumentFileKind({ mimeType: 'application/octet-stream', fileName: 'ADJUNTO.PDF' }), 'pdf');
  assert.equal(getDocumentFileKind({ originalName: 'imagen.webp' }), 'image');
  assert.equal(getDocumentFileKind({}), 'other');
});

test('el tamaño ausente o inválido se omite; cero bytes es un dato real', () => {
  for (const value of [null, undefined, '', 'sin dato', -1, Infinity]) assert.equal(formatDocumentSize(value), null);
  assert.equal(formatDocumentSize(0), '0 B');
  assert.equal(formatDocumentSize(512), '512 B');
  assert.equal(formatDocumentSize(1024), '1 KB');
  assert.equal(formatDocumentSize(1024 ** 2 * 2.5), '2,5 MB');
  assert.equal(formatDocumentSize(1024 ** 3), '1 GB');
});

test('las asociaciones ficticias del fallback del adaptador no se muestran como metadatos', () => {
  assert.equal(getDocumentAssociation('Causa sin referencia', 'Causa sin referencia'), null);
  assert.equal(getDocumentAssociation('Audiencia sin referencia', 'Audiencia sin referencia'), null);
  assert.equal(getDocumentAssociation('Causa personal 1', 'Causa sin referencia'), 'Causa personal 1');
  assert.equal(getDocumentAssociation(null, 'Causa sin referencia'), null);
});

test('un archivo privado con path nulo usa downloadUrl y conserva el contexto de estudio', () => {
  const file = { id: 7, path: null, downloadUrl: '/api/v1/documentos/7/download' };
  const url = new URL(getDocumentDownloadUrl(file, 'https://api.test', { type: 'study', legalStudyId: 'study-a' }));
  assert.equal(url.origin, 'https://api.test');
  assert.equal(url.pathname, '/api/v1/documentos/7/download');
  assert.equal(url.searchParams.get('scope'), 'study');
  assert.equal(url.searchParams.get('legalStudyId'), 'study-a');
  assert.equal(new URL(getDocumentDownloadUrl(file, 'https://api.test', { type: 'personal' })).searchParams.get('scope'), 'personal');
});

test('no se envía el token a URLs externas, uploads públicos ni rutas de otra función', () => {
  for (const downloadUrl of ['https://external.test/api/v1/documentos/7/download', '/uploads/documento.pdf', '/api/v1/documentos/7/text', '/api/v1/documentos/7/preview', '/api/v1/documentos/7/download/extra', 'javascript:alert(1)']) {
    assert.equal(getDocumentDownloadUrl({ downloadUrl }, 'https://api.test', { type: 'personal' }), null);
  }
  assert.equal(getDocumentDownloadUrl({}, 'https://api.test'), null);
});
