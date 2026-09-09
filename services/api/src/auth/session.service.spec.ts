import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { AuthStateStore } from './auth-state.store';
import { SessionService } from './session.service';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
type SessionPrismaMock = {
  session: {
    findUnique: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  societyMembership: { findMany: ReturnType<typeof vi.fn> };
};

describe('SessionService lifecycle security', () => {
  let state: AuthStateStore;
  let prisma: SessionPrismaMock;
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
    service = new SessionService(prisma as unknown as PrismaService, state);
  });

  afterEach(async () => {
    await state.onModuleDestroy();
  });

  it('rejects an otherwise-valid bearer session when its society is suspended', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-suspended-society',
      userId: '11111111-1111-4111-8111-111111111111',
      societyId: '22222222-2222-4222-8222-222222222222',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { status: 'ACTIVE' },
      society: { status: 'SUSPENDED' },
    });

    await expect(service.getPrincipal('access-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.societyMembership.findMany).not.toHaveBeenCalled();
  });

  it('returns no society roles for an independent-home session', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 'independent-session',
      userId: '11111111-1111-4111-8111-111111111111',
      societyId: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { status: 'ACTIVE' },
      society: null,
    });
    prisma.societyMembership.findMany.mockResolvedValue([{ role: 'SOCIETY_ADMIN' }]);

    await expect(service.getPrincipal('independent-access-token')).resolves.toEqual({
      userId: '11111111-1111-4111-8111-111111111111',
      societyId: undefined,
      roles: [],
    });
    expect(prisma.societyMembership.findMany).not.toHaveBeenCalled();
  });

  it('rotates a refresh token and rejects reuse of the previous token by revoking the session', async () => {
    const refreshToken = 'old-refresh-token';
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-one',
      societyId: null,
      revokedAt: null,
      refreshExpiresAt: new Date(Date.now() + 60_000),
      refreshTokenHash: hash(refreshToken),
      user: { status: 'ACTIVE' },
      society: null,
    });

    const rotated = await service.refresh('session-one', refreshToken);
    expect(rotated.refreshToken).not.toBe(refreshToken);
    expect(prisma.session.updateMany).toHaveBeenCalledTimes(1);

    await expect(service.refresh('session-one', refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.session.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.session.updateMany.mock.calls[1][0].data.revokedAt).toBeInstanceOf(Date);
  });

  it('rejects refresh when the linked society is suspended before rotating tokens', async () => {
    const refreshToken = 'suspended-refresh-token';
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-suspended-refresh',
      societyId: '22222222-2222-4222-8222-222222222222',
      revokedAt: null,
      refreshExpiresAt: new Date(Date.now() + 60_000),
      refreshTokenHash: hash(refreshToken),
      user: { status: 'ACTIVE' },
      society: { status: 'SUSPENDED' },
    });

    await expect(service.refresh('session-suspended-refresh', refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it('rejects refresh when the user is inactive before rotating tokens', async () => {
    const refreshToken = 'inactive-user-refresh-token';
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-inactive-user',
      societyId: null,
      revokedAt: null,
      refreshExpiresAt: new Date(Date.now() + 60_000),
      refreshTokenHash: hash(refreshToken),
      user: { status: 'SUSPENDED' },
      society: null,
    });

    await expect(service.refresh('session-inactive-user', refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it('uses compare-and-set rotation so a stale refresh cannot overwrite a newer token', async () => {
    const refreshToken = 'current-refresh-token';
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-two',
      societyId: null,
      revokedAt: null,
      refreshExpiresAt: new Date(Date.now() + 60_000),
      refreshTokenHash: hash(refreshToken),
      user: { status: 'ACTIVE' },
      society: null,
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
