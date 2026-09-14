import { BadRequestException } from '@nestjs/common';
import { AppRole } from '../auth/auth.types';
import { describe, expect, it, vi } from 'vitest';
import { SosRoutingService } from './sos-routing.service';

describe('SosRoutingService', () => {
  it('rejects a responder without SOS response permission', async () => {
    const prisma = {
      societyMembership: { findMany: vi.fn().mockResolvedValue([{ role: AppRole.ACCOUNTANT }]) },
    } as never;
    const service = new SosRoutingService(prisma);

    await expect(service.upsertPolicy(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      {
        severity: 'CRITICAL',
        acknowledgeWithinMinutes: 5,
        responderUserId: '33333333-3333-4333-8333-333333333333',
      },
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a responder role that carries SOS response permission', async () => {
    const prisma = {
      societyMembership: { findMany: vi.fn().mockResolvedValue([{ role: AppRole.SECURITY_SUPERVISOR }]) },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'policy', severity: 'CRITICAL' }]),
    } as never;
    const service = new SosRoutingService(prisma);

    await expect(service.upsertPolicy(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      {
        severity: 'CRITICAL',
        acknowledgeWithinMinutes: 5,
        responderUserId: '33333333-3333-4333-8333-333333333333',
      },
    )).resolves.toMatchObject({ id: 'policy' });
  });

  it('uses automation-aware history rendering', async () => {
    const prisma = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: 'incident' }])
        .mockResolvedValueOnce([]),
    } as never;
    const service = new SosRoutingService(prisma);

    await service.history(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    );

    const sql = (prisma.$queryRaw.mock.calls[1][0] as { strings: readonly string[] }).strings.join(' ');
    expect(sql).toContain("actorSource");
    expect(sql).toContain('Aaraagate automation');
    expect(sql).toContain('LEFT JOIN');
  });
});
