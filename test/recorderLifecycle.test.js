const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const babel = require('@babel/core');

const utilityPath = path.resolve(__dirname, '../src/utils/recorderLifecycle.js');
const transformed = babel.transformSync(fs.readFileSync(utilityPath, 'utf8'), {
  filename: utilityPath,
  plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code;
const utilityModule = { exports: {} };
const revoked = [];
vm.runInNewContext(transformed, {
  module: utilityModule,
  exports: utilityModule.exports,
  URL: { revokeObjectURL: (uri) => revoked.push(uri) },
});
const { prepareAndStartRecorder, stopRecorderChunk } = utilityModule.exports;

test('cancelar durante prepare detiene el stream y no deja el recorder activo', async () => {
  let releasePreparation;
  let recording = false;
  const calls = [];
  const prepared = new Promise((resolve) => { releasePreparation = resolve; });
  const recorder = {
    async prepareToRecordAsync() {
      calls.push('prepare');
      await prepared;
    },
    record() {
      calls.push('record');
      recording = true;
    },
    async stop() {
      calls.push('stop');
      recording = false;
      this.uri = 'blob:cancelled-recording';
    },
  };
  let canContinue = true;
  const starting = prepareAndStartRecorder(recorder, () => canContinue);
  canContinue = false;
  releasePreparation();

  assert.equal(await starting, false);
  assert.deepEqual(calls, ['prepare', 'record', 'stop']);
  assert.equal(recording, false);
  assert.deepEqual(revoked, ['blob:cancelled-recording']);
});

test('el último bloque usa su duración efectiva y la URL creada al detener', async () => {
  const recorder = {
    uri: 'blob:previous-chunk',
    getStatus() {
      return { durationMillis: 1375, url: 'blob:previous-chunk' };
    },
    async stop() {
      this.uri = 'blob:final-partial';
    },
  };

  const chunk = await stopRecorderChunk(recorder, 5);
  assert.equal(chunk.durationSeconds, 1.375);
  assert.equal(chunk.audioUri, 'blob:final-partial');
});
