type HeaderResponse = {
  setHeader(name: string, value: string): unknown;
};

const BASE_SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
});

export function applyHttpSecurityHeaders(response: HeaderResponse, production = process.env.NODE_ENV === 'production') {
  for (const [name, value] of Object.entries(BASE_SECURITY_HEADERS)) {
    response.setHeader(name, value);
  }
  if (production) {
    response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}
