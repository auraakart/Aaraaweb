import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStateStore } from './auth-state.store';
import { SessionService } from './session.service';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

describe('SessionService lifecycle security', () => {
  let state: AuthStateStore;
  let prisma: any;
  let service: SessionService;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    process.env.NODE_ENV = 'test';
    state = new AuthStateStore();
    prisma = {
      session: {
        findUnique: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn(),
      },
      societyMembership: { findMany: vi.fn() },
    };
    service = new SessionService(prisma, state);
  });

  afterEach(async () => {
    await state.onModuleDestroy();
  });

  it('rotates a refresh token and rejects reuse of the previous token by revoking the session', async () => {
    const refreshToken = 'old-refresh-token';
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-one',
      revokedAt: null,
      refreshExpiresAt: new Date(Date.now() + 60_000),
      refreshTokenHash: hash(refreshToken),
    });

    const rotated = await service.refresh('session-one', refreshToken);
    expect(rotated.refreshToken).not.toBe(refreshToken);
    expect(prisma.session.updateMany).toHaveBeenCalledTimes(1);

    await expect(service.refresh('session-one', refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.session.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.session.updateMany.mock.calls[1][0].data.revokedAt).toBeInstanceOf(Date);
  });

  it('uses compare-and-set rotation so a stale refresh cannot overwrite a newer token', async () => {
    const refreshToken = 'current-refresh-token';
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-two',
      revokedAt: null,
      refreshExpiresAt: new Date(Date.now() + 60_000),
      refreshTokenHash: hash(refreshToken),
    });
    prisma.session.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(service.refresh('session-two', refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.session.updateMany.mock.calls[0][0].where.refreshTokenHash).toBe(hash(refreshToken));
    expect(prisma.session.updateMany.mock.calls[1][0].data.revokedAt).toBeInstanceOf(Date);
  });

  it('requires possession of the current refresh token to revoke a session', async () => {
    prisma.session.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.revoke('session-three', 'wrong-refresh-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.session.updateMany.mock.calls[0][0].where.refreshTokenHash).toBe(hash('wrong-refresh-token'));
  });

  it('revokes a session when the current refresh token is presented', async () => {
    prisma.session.updateMany.mockResolvedValueOnce({ count: 1 });
    await expect(service.revoke('session-four', 'current-token')).resolves.toBeUndefined();
    expect(prisma.session.updateMany.mock.calls[0][0].data.revokedAt).toBeInstanceOf(Date);
  });
});
