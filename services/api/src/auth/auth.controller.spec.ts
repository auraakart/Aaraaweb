import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller';

const activeUser = { id: '11111111-1111-4111-8111-111111111111', status: 'ACTIVE' };

type PropertyRow = {
  societyId: string;
  unitId: string;
  unit: { number: string; building: { name: string; code: string } };
};

type MembershipFindArgs = { where?: { societyId?: string } };

function buildController(options?: {
  memberships?: Array<{ societyId: string; role: string; society: { name: string; code: string } }>;
  ownerships?: PropertyRow[];
  occupancies?: PropertyRow[];
}) {
  const membershipRows = options?.memberships ?? [];
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue(activeUser) },
    societyMembership: {
      findMany: vi.fn().mockImplementation(({ where }: MembershipFindArgs) => {
        if (where?.societyId) return Promise.resolve(membershipRows.filter((row) => row.societyId === where.societyId).map((row) => ({ role: row.role })));
        return Promise.resolve(membershipRows);
      }),
    },
    unitOwnership: { findMany: vi.fn().mockResolvedValue(options?.ownerships ?? []) },
    unitOccupancy: { findMany: vi.fn().mockResolvedValue(options?.occupancies ?? []) },
  };
  const authService = {
    verifyOtp: vi.fn().mockResolvedValue({ verified: true, phone: '+919999999999' }),
    createSocietySelectionGrant: vi.fn().mockResolvedValue({ token: 'selection-token', expiresAt: new Date('2026-09-07T00:00:00Z') }),
    consumeSocietySelectionGrant: vi.fn().mockResolvedValue(true),
  };
  const sessions = {
    create: vi.fn().mockResolvedValue({ sessionId: 'session-id', accessToken: 'access', refreshToken: 'refresh' }),
    refresh: vi.fn(),
    revoke: vi.fn(),
  };
  const controller = new AuthController(authService as never, prisma as never, sessions as never);
  return { controller, prisma, authService, sessions };
}

describe('AuthController user contexts', () => {
  it('creates an independent-home session when an active user has no society memberships', async () => {
    const { controller, sessions } = buildController();

    const result = await controller.verifyOtp({ challengeId: 'challenge', code: '123456' });

    expect(result).toMatchObject({ contextType: 'INDEPENDENT_HOME', memberships: [], contexts: [] });
    expect(sessions.create).toHaveBeenCalledWith(activeUser.id, undefined, []);
  });

  it('preserves legacy role rows while grouping multiple roles into one resident society context', async () => {
    const societyId = '22222222-2222-4222-8222-222222222222';
    const { controller, authService, sessions } = buildController({
      memberships: [
        { societyId, role: 'OWNER', society: { name: 'Green Heights', code: 'GH' } },
        { societyId, role: 'COMMITTEE_MEMBER', society: { name: 'Green Heights', code: 'GH' } },
      ],
    });

    const result = await controller.verifyOtp({ challengeId: 'challenge', code: '123456' });

    expect(result.contextType).toBe('SOCIETY_SELECTION');
    expect(result.memberships).toHaveLength(2);
    expect(result.contexts).toHaveLength(1);
    expect(result.contexts[0].roles).toEqual(['OWNER', 'COMMITTEE_MEMBER']);
    expect(authService.createSocietySelectionGrant).toHaveBeenCalledWith(activeUser.id);
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('returns one grouped chooser context per society with both owned and occupied properties', async () => {
    const firstSociety = '22222222-2222-4222-8222-222222222222';
    const secondSociety = '33333333-3333-4333-8333-333333333333';
    const property = (societyId: string, unitId: string, number: string): PropertyRow => ({
      societyId,
      unitId,
      unit: { number, building: { name: 'Tower A', code: 'A' } },
    });
    const { controller, authService, sessions } = buildController({
      memberships: [
        { societyId: firstSociety, role: 'OWNER', society: { name: 'Green Heights', code: 'GH' } },
        { societyId: secondSociety, role: 'TENANT', society: { name: 'Lake View', code: 'LV' } },
      ],
      ownerships: [property(firstSociety, '44444444-4444-4444-8444-444444444444', '1204')],
      occupancies: [property(secondSociety, '55555555-5555-4555-8555-555555555555', '703')],
    });

    const result = await controller.verifyOtp({ challengeId: 'challenge', code: '123456' });

    expect(result.contextType).toBe('SOCIETY_SELECTION');
    expect(result.memberships).toHaveLength(2);
    expect(result.contexts).toHaveLength(2);
    expect(result.contexts[0].properties[0]).toMatchObject({ unitNumber: '1204', relationship: 'OWNER' });
    expect(result.contexts[1].properties[0]).toMatchObject({ unitNumber: '703', relationship: 'OCCUPANT' });
    expect(authService.createSocietySelectionGrant).toHaveBeenCalledWith(activeUser.id);
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('refuses authenticated switching to a society the user does not belong to', async () => {
    const { controller } = buildController({ memberships: [] });
    await expect(controller.switchSociety(activeUser.id, { societyId: '66666666-6666-4666-8666-666666666666' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
