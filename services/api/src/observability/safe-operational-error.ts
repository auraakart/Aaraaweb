const SAFE_TOKEN = /^[A-Za-z0-9._:/-]{1,96}$/;

function safeToken(value: unknown) {
  return typeof value === 'string' && SAFE_TOKEN.test(value) ? value : undefined;
}

/**
 * Returns a deliberately minimal descriptor for operational logs and durable
 * retry evidence. Error messages/stacks are excluded because upstream
 * providers and database clients can echo tokens, payloads, phone numbers or
 * payment details into them.
 */
export function safeOperationalError(error: unknown) {
  if (typeof error !== 'object' || error === null) return 'UnknownError';
  const candidate = error as { name?: unknown; code?: unknown };
  const name = safeToken(candidate.name) ?? (error instanceof Error ? 'Error' : 'UnknownError');
  const code = safeToken(candidate.code);
  return code ? `${name} code=${code}` : name;
}
