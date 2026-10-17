import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller';

const partnerId = '11111111-1111-4111-8111-111111111111';
const request = { header: (name: string) => ({ host: 'portal.partner.in', authorization: 'Bearer access' } as Record<string, string>)[name] };
describe('V5.4.18 SSR host session context', () => {
  it('returns only current server-derived host partner identity and forwards the request for revalidation', async () => {
    const sessions = { getPrincipal: vi.fn().mockResolvedValue({ userId: 'user', audience: 'PARTNER', hostPartnerId: partnerId, roles: [] }) };
    const controller = new AuthController({} as never, {} as never, sessions as never);
    await expect(controller.hostPartnerSession(request as never)).resolves.toEqual({ contextType: 'PARTNER_HOST', partnerId, hostname: 'portal.partner.in' });
    expect(sessions.getPrincipal).toHaveBeenCalledWith('access', request);
  });
  it('rejects unbound partner, society and operational principals', async () => {
    for (const principal of [
      { audience: 'PARTNER', roles: [] }, { roles: [], hostPartnerId: partnerId },
      { audience: 'PARTNER', roles: ['ADMIN'], hostPartnerId: partnerId },
      { audience: 'PARTNER', roles: [], hostPartnerId: partnerId, societyId: 'society' },
    ]) {
      const controller = new AuthController({} as never, {} as never, { getPrincipal: vi.fn().mockResolvedValue(principal) } as never);
      await expect(controller.hostPartnerSession(request as never)).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });
  it('denies missing credentials and propagates expired/revoked/cross-host rejection', async () => {
    const sessions = { getPrincipal: vi.fn().mockRejectedValue(new UnauthorizedException('Revoked')) };
    const controller = new AuthController({} as never, {} as never, sessions as never);
    await expect(controller.hostPartnerSession({ header: () => undefined } as never)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.getPrincipal).not.toHaveBeenCalled();
    await expect(controller.hostPartnerSession(request as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('enriches host OTP output only after current persisted session revalidation', async () => {
    const sessions = { getPrincipal: vi.fn().mockResolvedValue({ audience: 'PARTNER', hostPartnerId: partnerId, roles: [] }) };
    const controller = new AuthController({} as never, {} as never, sessions as never);
    const reply = { verified: true as const, contextType: 'PARTNER' as const, session: { accessToken: 'access' } };
    vi.spyOn(controller, 'verifyPartnerOtp').mockResolvedValue(reply as never);
    const result = await controller.verifyHostPartnerOtp({ challengeId: partnerId, code: '123456' }, request as never);
    expect(result.hostContext.partnerId).toBe(partnerId);
    expect(result.hostContext.hostname).toBe('portal.partner.in');
  });
});
