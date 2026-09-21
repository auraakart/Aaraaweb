export class AaraagateApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'AaraagateApiError';
  }
}

export type AaraagateRequestOptions = RequestInit & {
  accessToken?: string;
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
    const { accessToken, headers, ...init } = options;
    const response = await fetch(`${base}/api/v1${path}`, {
      ...init,
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
  };
}
