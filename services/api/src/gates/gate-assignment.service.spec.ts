import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { GateAssignmentService } from './gate-assignment.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const gateId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const assignmentId = '44444444-4444-4444-8444-444444444444';

function fixture() {
  const row = { id: assignmentId, societyId, gateId, userId, active: true };
  const tx = {
    gate: { findFirst: vi.fn().mockResolvedValue({ id: gateId }) },
    societyMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'membership' }) },
    $queryRaw: vi.fn().mockResolvedValue([row]),
  };
  const prisma = {
    withTenantContext: vi.fn(async (_id, callback) => callback(tx)),
    gate: { findFirst: vi.fn() },
    societyMembership: { findFirst: vi.fn() },
    $queryRaw: vi.fn(),
  };
  return { row, tx, prisma, service: new GateAssignmentService(prisma as unknown as PrismaService) };
}

describe('Gate assignment tenant boundary', () => {
  it.each(['assertAssigned', 'list', 'assign', 'deactivate'] as const)('keeps %s entirely on the society transaction', async method => {
    const { service, prisma, tx, row } = fixture();
    const result = method === 'assertAssigned' ? await service.assertAssigned(societyId, gateId, userId)
      : method === 'list' ? await service.list(societyId, gateId)
      : method === 'assign' ? await service.assign(societyId, gateId, userId)
      : await service.deactivate(societyId, gateId, assignmentId);
    expect(result).toEqual(method === 'list' ? [row] : row);
    expect(prisma.withTenantContext).toHaveBeenCalledWith(societyId, expect.any(Function));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.gate.findFirst).not.toHaveBeenCalled();
    expect(prisma.societyMembership.findFirst).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
  });

  it.each(['list', 'assign', 'deactivate'] as const)('rejects a foreign gate before %s can read or write assignments', async method => {
    const { service, tx } = fixture();
    tx.gate.findFirst.mockResolvedValue(null);
    const result = method === 'list' ? service.list(societyId, gateId)
      : method === 'assign' ? service.assign(societyId, gateId, userId)
      : service.deactivate(societyId, gateId, assignmentId);
    await expect(result).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.gate.findFirst).toHaveBeenCalledWith({ where: { id: gateId, societyId }, select: { id: true } });
    expect(tx.societyMembership.findFirst).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects a user without active security membership before writing', async () => {
    const { service, tx } = fixture();
    tx.societyMembership.findFirst.mockResolvedValue(null);
    await expect(service.assign(societyId, gateId, userId)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.societyMembership.findFirst).toHaveBeenCalledWith({ where: {
      societyId, userId, active: true, role: { in: [MembershipRole.SECURITY_GUARD, MembershipRole.SECURITY_SUPERVISOR] },
    }, select: { id: true } });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects reversed explicit assignment dates without writing', async () => {
    const { service, tx } = fixture();
    await expect(service.assign(societyId, gateId, userId, new Date('2026-10-12'), new Date('2026-10-11')))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('denies an absent or expired assignment', async () => {
    const { service, tx } = fixture();
    tx.$queryRaw.mockResolvedValue([]);
    await expect(service.assertAssigned(societyId, gateId, userId)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not report successful deactivation for another society assignment', async () => {
    const { service, tx } = fixture();
    tx.$queryRaw.mockResolvedValue([]);
    await expect(service.deactivate(societyId, gateId, assignmentId)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('rejects a past end date when the assignment start defaults to now', async () => {
    const { service, tx } = fixture();
    await expect(service.assign(societyId, gateId, userId, undefined, new Date(0)))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

});
