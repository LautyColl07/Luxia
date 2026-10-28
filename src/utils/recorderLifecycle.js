export async function prepareAndStartRecorder(recorder, canContinue) {
  await recorder.prepareToRecordAsync();
  if (!canContinue()) {
    try {
      recorder.record();
      await recorder.stop();
    } catch {
      // Starting and immediately stopping closes the prepared MediaStream on web.
    }
    const uri = recorder.uri;
    if (
      typeof uri === 'string' &&
      uri.startsWith('blob:') &&
      typeof URL !== 'undefined' &&
      typeof URL.revokeObjectURL === 'function'
    ) {
      URL.revokeObjectURL(uri);
    }
    return false;
  }

  recorder.record();
  return true;
}

export async function stopRecorderChunk(recorder, maximumDurationSeconds) {
  const statusBeforeStop = recorder.getStatus();
  await recorder.stop();
  const statusAfterStop = recorder.getStatus();
  const durationSeconds = Math.min(
    maximumDurationSeconds,
    Math.max(0, Number(statusBeforeStop?.durationMillis) / 1000 || 0)
  );
  const audioUri = recorder.uri || statusAfterStop?.url || statusBeforeStop?.url;

  if (!audioUri) throw new Error('No se encontró el archivo temporal de audio.');
  return { audioUri, durationSeconds };
}
