import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ParkingPermitService } from './parking-permit.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const slotId = '33333333-3333-4333-8333-333333333333';
const visitorId = '44444444-4444-4444-8444-444444444444';
const passId = '55555555-5555-4555-8555-555555555555';
const permitId = '66666666-6666-4666-8666-666666666666';

const validInput = {
  slotId,
  visitorId,
  visitorPassId: passId,
  plateNumber: ' tn 01 ab 1234 ',
  startsAt: '2026-09-15T10:00:00.000Z',
  endsAt: '2026-09-15T12:00:00.000Z',
};

describe('ParkingPermitService', () => {
  it('rejects an invalid permit window before persistence', async () => {
    const prisma = { $transaction: vi.fn() };
    const service = new ParkingPermitService(prisma as unknown as PrismaService);
    await expect(service.create(societyId, actorId, {
      ...validInput,
      endsAt: '2026-09-15T09:00:00.000Z',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires an eligible society-scoped visitor pass and parking slot', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValueOnce([]), $executeRaw: vi.fn() };
    const prisma = { $transaction: vi.fn((cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new ParkingPermitService(prisma as unknown as PrismaService);
    await expect(service.create(societyId, actorId, validInput)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects overlapping active permits before insert', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ slotId, visitorId }])
        .mockResolvedValueOnce([{ id: permitId }]),
      $executeRaw: vi.fn(),
    };
    const prisma = { $transaction: vi.fn((cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new ParkingPermitService(prisma as unknown as PrismaService);
    await expect(service.create(societyId, actorId, validInput)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('creates a normalized plate permit and audit event transactionally', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ slotId, visitorId }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: permitId }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: vi.fn((cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new ParkingPermitService(prisma as unknown as PrismaService);
    await expect(service.create(societyId, actorId, validInput)).resolves.toEqual({ id: permitId });
    const insertSql = tx.$queryRaw.mock.calls[2][0] as { strings: readonly string[]; values: unknown[] };
    expect(insertSql.values).toContain('TN 01 AB 1234');
    const eventSql = (tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(eventSql).toContain("'PERMIT_CREATED'");
  });

  it('cancels only active society-scoped permits and records evidence', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: permitId, slotId }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: vi.fn((cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new ParkingPermitService(prisma as unknown as PrismaService);
    await expect(service.cancel(societyId, actorId, permitId, 'Visit cancelled')).resolves.toEqual({ id: permitId, slotId });
    const cancelSql = (tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(cancelSql).toContain('"status"=\'CANCELLED\'');
    expect(cancelSql).toContain('"societyId"');
    const eventSql = (tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(eventSql).toContain("'PERMIT_CANCELLED'");
  });

  it('maps database overlap races to a conflict', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ slotId, visitorId }])
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('Parking slot already has an overlapping active permit')),
      $executeRaw: vi.fn(),
    };
    const prisma = { $transaction: vi.fn((cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new ParkingPermitService(prisma as unknown as PrismaService);
    await expect(service.create(societyId, actorId, validInput)).rejects.toBeInstanceOf(ConflictException);
  });
});
