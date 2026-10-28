export function createTranscriptionChunkQueue({ limit = 3, processTask, onSizeChange } = {}) {
  const queue = [];
  let activeDrain = null;

  if (typeof processTask !== 'function') {
    throw new TypeError('processTask debe ser una función.');
  }

  const notifySize = () => onSizeChange?.(queue.length);

  return {
    enqueue(task) {
      if (queue.length >= limit) return false;
      queue.push(task);
      notifySize();
      return true;
    },

    size() {
      return queue.length;
    },

    pending() {
      return [...queue];
    },

    async drain() {
      if (activeDrain) return activeDrain;

      activeDrain = (async () => {
        while (queue.length) {
          const task = queue[0];
          try {
            await processTask(task);
            queue.shift();
            notifySize();
          } catch (error) {
            return { ok: false, error, task, remaining: queue.length };
          }
        }

        return { ok: true, remaining: 0 };
      })().finally(() => {
        activeDrain = null;
      });

      return activeDrain;
    },

    clear(onRemove) {
      const removed = queue.splice(0, queue.length);
      removed.forEach((task) => onRemove?.(task));
      notifySize();
      return removed;
    },
  };
}
