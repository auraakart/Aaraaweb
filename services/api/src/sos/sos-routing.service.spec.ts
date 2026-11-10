import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AppRole } from '../auth/auth.types';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { SosRoutingService } from './sos-routing.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '22222222-2222-4222-8222-222222222222';
const responderUserId = '33333333-3333-4333-8333-333333333333';

function createTenantPrisma<T extends object>(tx: T) {
  const withTenantContext = vi.fn(async (_societyId: string, operation: (client: T) => Promise<unknown>) =>
    operation(tx),
  );
  return { prisma: { withTenantContext }, withTenantContext };
}

describe('SosRoutingService tenant context', () => {
  it('lists routing policies inside the selected society transaction', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ id: 'policy-1' }]) };
    const { prisma, withTenantContext } = createTenantPrisma(tx);
    const service = new SosRoutingService(prisma as unknown as PrismaService);

    await expect(service.listPolicies(societyId)).resolves.toEqual([{ id: 'policy-1' }]);
    expect(withTenantContext).toHaveBeenCalledWith(societyId, expect.any(Function));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const query = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(query.strings.join(' ')).toContain('WHERE p."societyId"=');
    expect(query.values).toContain(societyId);
  });

  it('lists only SOS responders using tenant-scoped membership reads', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([
        { userId: responderUserId, name: 'Supervisor', role: AppRole.SECURITY_SUPERVISOR },
        { userId: actorUserId, name: 'Accountant', role: AppRole.ACCOUNTANT },
      ]),
    };
    const { prisma, withTenantContext } = createTenantPrisma(tx);
    const service = new SosRoutingService(prisma as unknown as PrismaService);

    const result = await service.listCandidates(societyId);
    expect(result).toEqual([{ userId: responderUserId, name: 'Supervisor', roles: [AppRole.SECURITY_SUPERVISOR] }]);
    expect(withTenantContext).toHaveBeenCalledWith(societyId, expect.any(Function));
    const query = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(query.strings.join(' ')).toContain('"SocietyMembership"');
    expect(query.strings.join(' ')).toContain(`u."status"='ACTIVE'`);
    expect(query.values).toContain(societyId);
  });

  it('rejects a responder without SOS response permission without writing a policy', async () => {
    const tx = {
      societyMembership: { findMany: vi.fn().mockResolvedValue([{ role: AppRole.ACCOUNTANT }]) },
      $queryRaw: vi.fn(),
    };
    const { prisma, withTenantContext } = createTenantPrisma(tx);
    const service = new SosRoutingService(prisma as unknown as PrismaService);

    await expect(service.upsertPolicy(societyId, actorUserId, {
      severity: 'CRITICAL',
      acknowledgeWithinMinutes: 5,
      responderUserId,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(withTenantContext).toHaveBeenCalledWith(societyId, expect.any(Function));
    expect(tx.societyMembership.findMany).toHaveBeenCalledWith({
      where: { societyId, userId: responderUserId, active: true, user: { is: { status: 'ACTIVE' } } },
      select: { role: true },
    });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });


  it('rejects inactive user accounts when configuring an SOS responder policy', async () => {
    const tx = {
      societyMembership: { findMany: vi.fn().mockResolvedValue([]) },
      $queryRaw: vi.fn(),
    };
    const { prisma, withTenantContext } = createTenantPrisma(tx);
    const service = new SosRoutingService(prisma as unknown as PrismaService);

    await expect(service.upsertPolicy(societyId, actorUserId, {
      severity: 'CRITICAL',
      acknowledgeWithinMinutes: 5,
      responderUserId,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(withTenantContext).toHaveBeenCalledWith(societyId, expect.any(Function));
    expect(tx.societyMembership.findMany).toHaveBeenCalledWith({
      where: { societyId, userId: responderUserId, active: true, user: { is: { status: 'ACTIVE' } } },
      select: { role: true },
    });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('validates responder membership and writes the policy in the same tenant transaction', async () => {
    const tx = {
      societyMembership: { findMany: vi.fn().mockResolvedValue([{ role: AppRole.SECURITY_SUPERVISOR }]) },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'policy-1', severity: 'CRITICAL' }]),
    };
    const { prisma, withTenantContext } = createTenantPrisma(tx);
    const service = new SosRoutingService(prisma as unknown as PrismaService);

    await expect(service.upsertPolicy(societyId, actorUserId, {
      severity: 'CRITICAL',
      acknowledgeWithinMinutes: 5,
      responderUserId,
      active: true,
    })).resolves.toMatchObject({ id: 'policy-1' });

    expect(withTenantContext).toHaveBeenCalledWith(societyId, expect.any(Function));
    expect(tx.societyMembership.findMany).toHaveBeenCalledTimes(1);
    const insert = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(insert.strings.join(' ')).toContain('INSERT INTO "SosRoutingPolicy"');
    expect(insert.values).toContain(societyId);
    expect(insert.values).toContain(actorUserId);
    expect(insert.values).toContain(responderUserId);
  });

  it('rejects an acknowledgement deadline outside the supported range before opening a transaction', async () => {
    const tx = { societyMembership: { findMany: vi.fn() }, $queryRaw: vi.fn() };
    const { prisma, withTenantContext } = createTenantPrisma(tx);
    const service = new SosRoutingService(prisma as unknown as PrismaService);

    await expect(service.upsertPolicy(societyId, actorUserId, {
      severity: 'CRITICAL',
      acknowledgeWithinMinutes: 1441,
      responderUserId,
    })).rejects.toThrow('SOS acknowledgement deadline must be between 1 and 1440 minutes');
    expect(withTenantContext).not.toHaveBeenCalled();
  });

  it('reads incident and event history in one selected-society transaction', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: 'incident-1' }])
        .mockResolvedValueOnce([{ id: 'event-1' }]),
    };
    const { prisma, withTenantContext } = createTenantPrisma(tx);
    const service = new SosRoutingService(prisma as unknown as PrismaService);

    await expect(service.history(societyId, '44444444-4444-4444-8444-444444444444'))
      .resolves.toEqual([{ id: 'event-1' }]);
    expect(withTenantContext).toHaveBeenCalledWith(societyId, expect.any(Function));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    const eventQuery = tx.$queryRaw.mock.calls[1][0] as { strings: readonly string[] };
    expect(eventQuery.strings.join(' ')).toContain('actorSource');
    expect(eventQuery.strings.join(' ')).toContain('Aaraagate automation');
    expect(eventQuery.strings.join(' ')).toContain('LEFT JOIN');
  });

  it('does not return incident history for an incident outside the selected society', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValueOnce([]) };
    const { prisma, withTenantContext } = createTenantPrisma(tx);
    const service = new SosRoutingService(prisma as unknown as PrismaService);

    await expect(service.history(societyId, '44444444-4444-4444-8444-444444444444'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(withTenantContext).toHaveBeenCalledWith(societyId, expect.any(Function));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
