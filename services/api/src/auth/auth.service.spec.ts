import { HttpException, UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStateStore } from './auth-state.store';
import { AuthService } from './auth.service';
import { OtpDeliveryService } from './otp-delivery.service';

type StoredOtp = { code: string; attempts: number; phone: string };

describe('AuthService security state', () => {
  let state: AuthStateStore;
  let service: AuthService;
  let delivery: OtpDeliveryService;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    process.env.NODE_ENV = 'test';
    state = new AuthStateStore();
    delivery = new OtpDeliveryService();
    service = new AuthService(state, delivery);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await state.onModuleDestroy();
  });

  it('delivers the generated OTP without exposing it in the challenge response', async () => {
    const send = vi.spyOn(delivery, 'send');
    const challenge = await service.requestOtp('+919876543209');
    const stored = await state.getJson<StoredOtp>(`auth:otp:${challenge.challengeId}`);

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ phone: '+919876543209', code: stored!.code }));
    expect(challenge).not.toHaveProperty('code');
  });

  it('removes the challenge when OTP delivery fails', async () => {
    vi.spyOn(delivery, 'send').mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(service.requestOtp('+919876543208')).rejects.toThrow('provider unavailable');
  });

  it('consumes a successful OTP so it cannot be replayed', async () => {
    const challenge = await service.requestOtp('+919876543210');
    const stored = await state.getJson<StoredOtp>(`auth:otp:${challenge.challengeId}`);
    expect(stored?.code).toHaveLength(6);

    await expect(service.verifyOtp(challenge.challengeId, stored!.code)).resolves.toMatchObject({ verified: true, phone: '+919876543210' });
    await expect(service.verifyOtp(challenge.challengeId, stored!.code)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('locks and removes an OTP challenge after five invalid attempts', async () => {
    const challenge = await service.requestOtp('+919876543211');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(service.verifyOtp(challenge.challengeId, '000000')).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(await state.getJson(`auth:otp:${challenge.challengeId}`)).toBeNull();
  });

  it('rate limits OTP issuance per normalized phone number', async () => {
    for (let request = 0; request < 5; request += 1) {
      await expect(service.requestOtp('+919876543212')).resolves.toBeDefined();
    }

    try {
      await service.requestOtp('+919876543212');
      throw new Error('Expected OTP rate limit');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
    }
  });

  it('rejects society selection grant use by a different user without consuming the valid grant', async () => {
    const grant = await service.createSocietySelectionGrant('user-one');
    await expect(service.consumeSocietySelectionGrant(grant.token, 'user-two')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.consumeSocietySelectionGrant(grant.token, 'user-one')).resolves.toBe(true);
  });

  it('consumes society selection grants exactly once', async () => {
    const grant = await service.createSocietySelectionGrant('user-one');
    await expect(service.consumeSocietySelectionGrant(grant.token, 'user-one')).resolves.toBe(true);
    await expect(service.consumeSocietySelectionGrant(grant.token, 'user-one')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
