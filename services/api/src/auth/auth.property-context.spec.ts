import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller';

const userId = '11111111-1111-4111-8111-111111111111';
const societyId = '22222222-2222-4222-8222-222222222222';
const unitId = '33333333-3333-4333-8333-333333333333';
const property = {
  societyId,
  unitId,
  unit: { number: '1204', building: { name: 'Tower A', code: 'A' } },
};

describe('AuthController property contexts', () => {
  it('returns one physical property when the user is both owner and occupant', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: userId, status: 'ACTIVE' }) },
      societyMembership: {
        findMany: vi.fn().mockResolvedValue([
          { societyId, role: 'OWNER', society: { name: 'Green Heights', code: 'GH' } },
        ]),
      },
      unitOwnership: { findMany: vi.fn().mockResolvedValue([property]) },
      unitOccupancy: { findMany: vi.fn().mockResolvedValue([property]) },
    };
    const authService = {
      verifyOtp: vi.fn().mockResolvedValue({ verified: true, phone: '+919999999999' }),
    };
    const sessions = {
      create: vi.fn().mockResolvedValue({ sessionId: 'session', accessToken: 'access', refreshToken: 'refresh' }),
    };
    const controller = new AuthController(authService as never, prisma as never, sessions as never);

    const result = await controller.verifyOtp({ challengeId: 'challenge', code: '123456' });

    expect(result.contexts).toHaveLength(1);
    expect(result.contexts[0].properties).toEqual([
      expect.objectContaining({ unitId, relationship: 'OWNER' }),
    ]);
  });
});
