import { describe, expect, it, vi } from 'vitest';
import { applyHttpSecurityHeaders } from './http-security';

describe('applyHttpSecurityHeaders', () => {
  it('sets defensive API headers without requiring production TLS', () => {
    const response = { setHeader: vi.fn() };
    applyHttpSecurityHeaders(response, false);

    expect(response.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(response.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(response.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer');
    expect(response.setHeader).toHaveBeenCalledWith('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    expect(response.setHeader).not.toHaveBeenCalledWith('Strict-Transport-Security', expect.any(String));
  });

  it('adds HSTS in production', () => {
    const response = { setHeader: vi.fn() };
    applyHttpSecurityHeaders(response, true);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
  });
});
