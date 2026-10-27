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
    vi.useRealTimers();
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

  it('accepts a successful challenge only once under concurrent verification', async () => {
    const challenge = await service.requestOtp('+919876543213');
    const stored = await state.getJson<StoredOtp>(`auth:otp:${challenge.challengeId}`);
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => service.verifyOtp(challenge.challengeId, stored!.code)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await state.getJson(`auth:otp:${challenge.challengeId}`)).toBeNull();
  });

  it('counts simultaneous wrong codes and cannot restore a consumed challenge', async () => {
    const challenge = await service.requestOtp('+919876543214');
    const key = `auth:otp:${challenge.challengeId}`;
    const stored = await state.getJson<StoredOtp>(key);
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => service.verifyOtp(challenge.challengeId, '000000')));
    expect(results.every(result => result.status === 'rejected')).toBe(true);
    expect(await state.getJson(key)).toBeNull();
    await expect(service.verifyOtp(challenge.challengeId, stored!.code)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('never extends the original OTP validity after an incorrect attempt', async () => {
    vi.useFakeTimers();
    const challenge = await service.requestOtp('+919876543215');
    const stored = await state.getJson<StoredOtp>(`auth:otp:${challenge.challengeId}`);
    await vi.advanceTimersByTimeAsync(299_000);
    await expect(service.verifyOtp(challenge.challengeId, '000000')).rejects.toBeInstanceOf(UnauthorizedException);
    await vi.advanceTimersByTimeAsync(1_001);
    await expect(service.verifyOtp(challenge.challengeId, stored!.code)).rejects.toBeInstanceOf(UnauthorizedException);
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

  it('rejects state-key suffixes without touching the phone issuance counter', async () => {
    const phone = '+919876543216';
    await service.requestOtp(phone);
    const key = `auth:otp:rate:${phone}`;
    const verify = vi.spyOn(state, 'getJson');
    await expect(service.verifyOtp(`rate:${phone}`, '000000')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verify).not.toHaveBeenCalled();
    expect(await state.getJson(key)).toBe(1);
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
