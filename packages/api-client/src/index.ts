export class AaraagateApiError extends Error {
  readonly status: number;
  readonly body?: unknown;
  constructor(
    message: string,
    status: number,
    body?: unknown,
  ) {
    super(message);
    this.name = 'AaraagateApiError';
    this.status = status;
    this.body = body;
  }
}

export type AaraagateRequestOptions = RequestInit & {
  accessToken?: string;
  timeoutMs?: number;
};

export function normalizeApiBaseUrl(value?: string) {
  return (value ?? 'http://localhost:3000').replace(/\/$/, '');
}

export function apiErrorMessage(body: unknown, status: number) {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (Array.isArray(message)) return message.map(String).join(', ');
    if (typeof message === 'string') return message;
  }
  return `Request failed (${status})`;
}

export function createAaraagateApiClient(baseUrl: string) {
  const base = normalizeApiBaseUrl(baseUrl);
  return async function request<T>(path: string, options: AaraagateRequestOptions = {}): Promise<T> {
    const { accessToken, headers, timeoutMs = 20_000, ...init } = options;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('Request timeout must be positive');
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new DOMException('Request timed out; verify the current status before retrying.', 'TimeoutError')), timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, deadline.signal]) : deadline.signal;
    try {
      const response = await fetch(`${base}/api/v1${path}`, {
        ...init,
        signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...headers,
        },
      });
      const text = await response.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      if (!response.ok) throw new AaraagateApiError(apiErrorMessage(body, response.status), response.status, body);
      return body as T;
    } finally {
      clearTimeout(timer);
    }
  };
}
