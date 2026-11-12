export function normalizeApiErrorPayload(data, error = null) {
  const rawCode = data?.errorCode ?? data?.code ?? data?.error?.code ?? error?.code;
  const rawMessage = typeof data === 'string'
    ? data
    : typeof data?.error === 'string'
      ? data.error
      : data?.error?.message ?? data?.message ?? error?.message;
  return {
    code: typeof rawCode === 'string' && rawCode.trim() ? rawCode.trim().slice(0, 80) : null,
    message: typeof rawMessage === 'string' && rawMessage.trim() ? rawMessage.trim().slice(0, 240) : null,
  };
}
