import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ParkingService } from './parking.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const slotId = '33333333-3333-4333-8333-333333333333';
const householdId = '44444444-4444-4444-8444-444444444444';
const vehicleId = '55555555-5555-4555-8555-555555555555';
const allocationId = '66666666-6666-4666-8666-666666666666';

describe('ParkingService', () => {
  it('creates a normalized slot and audit event transactionally', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: slotId, code: 'B2-18' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: vi.fn((cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new ParkingService(prisma as unknown as PrismaService);

    await service.createSlot(societyId, actorId, { code: ' b2-18 ', evReady: true });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const insertSql = (tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] });
    expect(insertSql.values).toContain('B2-18');
    const eventSql = (tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(eventSql).toContain("'SLOT_CREATED'");
  });

  it('rejects invalid allocation windows before persistence', async () => {
    const prisma = { $transaction: vi.fn() };
    const service = new ParkingService(prisma as unknown as PrismaService);
    await expect(service.allocate(societyId, actorId, {
      slotId, householdId, vehicleId,
      startsAt: '2026-09-15T10:00:00.000Z',
      endsAt: '2026-09-15T09:00:00.000Z',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('validates active same-household vehicle before allocation', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{ id: slotId, active: true }]).mockResolvedValueOnce([]),
      $executeRaw: vi.fn(),
    };
    const prisma = { $transaction: vi.fn((cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new ParkingService(prisma as unknown as PrismaService);
    await expect(service.allocate(societyId, actorId, { slotId, householdId, vehicleId }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('maps active slot or vehicle uniqueness races to a conflict', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: slotId, active: true }])
        .mockResolvedValueOnce([{ id: vehicleId }])
        .mockResolvedValueOnce([{ maxActiveResidentVehicles: 2, requireCredential: false }])
        .mockResolvedValueOnce([{ count: 0n }])
        .mockRejectedValueOnce({ code: '23505' }),
      $executeRaw: vi.fn(),
    };
    const prisma = { $transaction: vi.fn((cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new ParkingService(prisma as unknown as PrismaService);
    await expect(service.allocate(societyId, actorId, { slotId, householdId, vehicleId }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('enforces credential-required society policy before allocation', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: slotId, active: true }])
        .mockResolvedValueOnce([{ id: vehicleId }])
        .mockResolvedValueOnce([{ maxActiveResidentVehicles: 2, requireCredential: true }])
        .mockResolvedValueOnce([{ count: 0n }])
        .mockResolvedValueOnce([]),
      $executeRaw: vi.fn(),
    };
    const prisma = { $transaction: vi.fn((cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new ParkingService(prisma as unknown as PrismaService);
    await expect(service.allocate(societyId, actorId, { slotId, householdId, vehicleId }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('releases only an active society-scoped allocation and records evidence', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: allocationId, slotId }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: vi.fn((cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new ParkingService(prisma as unknown as PrismaService);
    await expect(service.release(societyId, actorId, allocationId, 'Vehicle changed')).resolves.toEqual({ id: allocationId, slotId });
    const releaseSql = (tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(releaseSql).toContain('"societyId"');
    expect(releaseSql).toContain('"endedAt" IS NULL');
    const eventSql = (tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(eventSql).toContain("'RELEASED'");
  });
});
