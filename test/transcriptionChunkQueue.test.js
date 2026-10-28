const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const babel = require('@babel/core');

const queuePath = path.resolve(__dirname, '../src/utils/transcriptionChunkQueue.js');
const transformed = babel.transformSync(fs.readFileSync(queuePath, 'utf8'), {
  filename: queuePath,
  plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code;
const queueModule = { exports: {} };
vm.runInNewContext(transformed, { module: queueModule, exports: queueModule.exports });
const { createTranscriptionChunkQueue } = queueModule.exports;

test('la cola conserva el orden, limita el trabajo pendiente y procesa de a uno', async () => {
  const order = [];
  let active = 0;
  let maximumActive = 0;
  const queue = createTranscriptionChunkQueue({
    limit: 3,
    processTask: async (task) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(task.index);
      active -= 1;
    },
  });

  assert.equal(queue.enqueue({ index: 0 }), true);
  assert.equal(queue.enqueue({ index: 1 }), true);
  assert.equal(queue.enqueue({ index: 2 }), true);
  assert.equal(queue.enqueue({ index: 3 }), false);

  const firstDrain = queue.drain();
  const sharedDrain = queue.drain();
  const firstResult = await firstDrain;
  const sharedResult = await sharedDrain;
  assert.equal(firstResult.ok, true);
  assert.equal(firstResult.remaining, 0);
  assert.equal(sharedResult.ok, true);
  assert.equal(sharedResult.remaining, 0);
  assert.deepEqual(order, [0, 1, 2]);
  assert.equal(maximumActive, 1);
  assert.equal(queue.size(), 0);
});

test('un error mantiene el bloque y los siguientes para reintentar en orden', async () => {
  let failFirst = true;
  const order = [];
  const queue = createTranscriptionChunkQueue({
    processTask: async (task) => {
      order.push(task.index);
      if (task.index === 0 && failFirst) {
        failFirst = false;
        throw new Error('red');
      }
    },
  });
  queue.enqueue({ index: 0 });
  queue.enqueue({ index: 1 });

  const first = await queue.drain();
  assert.equal(first.ok, false);
  assert.equal(first.remaining, 2);
  assert.deepEqual([...queue.pending()].map((task) => task.index), [0, 1]);

  const retry = await queue.drain();
  assert.equal(retry.ok, true);
  assert.equal(retry.remaining, 0);
  assert.deepEqual(order, [0, 0, 1]);
});
