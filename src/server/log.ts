const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'turnstiletoken',
  'edittoken',
  'secret',
  'authorization',
  'cookie',
  'sessiontoken',
  'csrftoken',
]);

export function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[redacted]' : value;
  }
  return out;
}

export function log(event: string, meta: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...redact(meta), at: new Date().toISOString() }));
}

export function logError(event: string, error: unknown, meta: Record<string, unknown> = {}) {
  const detail =
    error instanceof Error ? { message: error.message, stack: error.stack } : String(error);
  console.error(
    JSON.stringify({ event, error: detail, ...redact(meta), at: new Date().toISOString() }),
  );
}
