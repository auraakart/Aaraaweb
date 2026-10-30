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
    const prisma = { withTenantContext: vi.fn() };
    const service = new ParkingPermitService(prisma as unknown as PrismaService);
    await expect(service.create(societyId, actorId, {
      ...validInput,
      endsAt: '2026-09-15T09:00:00.000Z',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });

  it('requires an eligible society-scoped visitor pass and parking slot', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValueOnce([]), $executeRaw: vi.fn() };
    const prisma = { withTenantContext: vi.fn((_scope: string, cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new ParkingPermitService(prisma as unknown as PrismaService);
    await expect(service.create(societyId, actorId, validInput)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    const eligibilitySql = (tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(eligibilitySql).toContain('"allowTemporaryOverflow"');
    expect(eligibilitySql).toContain("'TEMPORARY'");
  });

  it('rejects overlapping active permits before insert', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ slotId, visitorId }])
        .mockResolvedValueOnce([{ id: permitId }]),
      $executeRaw: vi.fn(),
    };
    const prisma = { withTenantContext: vi.fn((_scope: string, cb: (client: typeof tx) => unknown) => cb(tx)) };
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
    const prisma = { withTenantContext: vi.fn((_scope: string, cb: (client: typeof tx) => unknown) => cb(tx)) };
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
    const prisma = { withTenantContext: vi.fn((_scope: string, cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new ParkingPermitService(prisma as unknown as PrismaService);
    await expect(service.cancel(societyId, actorId, permitId, 'Visit cancelled')).resolves.toEqual({ id: permitId, slotId });
    const cancelSql = (tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(cancelSql).toContain('"status"=\'CANCELLED\'');
    expect(cancelSql).toContain('"societyId"');
    const eventQuery = tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(eventQuery.strings.join(' ')).toContain('INSERT INTO "ParkingEvent"');
    expect(eventQuery.values).toContain('PERMIT_CANCELLED');
    expect(eventQuery.values).toContain('Visit cancelled');
  });

  it('maps database overlap races to a conflict', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ slotId, visitorId }])
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('Parking slot already has an overlapping active permit')),
      $executeRaw: vi.fn(),
    };
    const prisma = { withTenantContext: vi.fn((_scope: string, cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new ParkingPermitService(prisma as unknown as PrismaService);
    await expect(service.create(societyId, actorId, validInput)).rejects.toBeInstanceOf(ConflictException);
  });
});

function scopedFixture() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  const prisma = new Proxy({ withTenantContext: vi.fn(async (scope: string, run: (client: typeof tx) => Promise<unknown>) => {
    if (scope !== societyId) throw new Error('Missing tenant context');
    return run(tx);
  }) }, { get(target, key) {
    if (key === 'withTenantContext') return target.withTenantContext;
    throw new Error(`Unscoped database access: ${String(key)}`);
  } });
  return { tx, prisma, service: new ParkingPermitService(prisma as never) };
}

describe('Parking permit transaction scope', () => {
  it.each(['list', 'eligibleVisitors'] as const)('keeps %s bounded and society-scoped without root access', async method => {
    const { tx, prisma, service } = scopedFixture();
    expect(await service[method](societyId)).toEqual([]);
    const sql = tx.$queryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
    expect(sql.values).toContain(societyId);
    expect(sql.sql).toContain('LIMIT 500');
    expect(sql.sql).toContain('b."societyId"=u."societyId"');
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
  });

  it('creates with normalized metadata and retains row locks and the scoped overlap check', async () => {
    const { tx, prisma, service } = scopedFixture();
    tx.$queryRaw.mockResolvedValueOnce([{ slotId, visitorId }]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: permitId }]);
    await service.create(societyId, actorId, { ...validInput, note: ' Visit ' });
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
    const queries = tx.$queryRaw.mock.calls.map(([sql]) => sql as { sql: string; values: unknown[] });
    expect(queries[0].sql).toContain('FOR UPDATE OF ps, vp');
    expect(queries[1].values).toContain(societyId);
    expect(queries[2].values).toContain('Visit');
  });

  it.each(['cancel', 'complete'] as const)('keeps %s state and event changes in one tenant context', async method => {
    const { tx, prisma, service } = scopedFixture();
    tx.$queryRaw.mockResolvedValue([{ id: permitId, slotId }]);
    expect(await service[method](societyId, actorId, permitId)).toEqual({ id: permitId, slotId });
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
    const sql = tx.$queryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
    expect(sql.values).toContain(societyId);
    expect(sql.sql).toContain('"status"=\'ACTIVE\'');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it.each(['cancel', 'complete'] as const)('denies missing/foreign or already terminal permits before %s audit writes', async method => {
    const { tx, service } = scopedFixture();
    await expect(service[method](societyId, actorId, permitId)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it.each([
    { startsAt: 'invalid' }, { plateNumber: ' ' }, { plateNumber: 'x'.repeat(31) }, { note: 'x'.repeat(301) },
  ])('retains request validation before database access: %j', async change => {
    const { prisma, service } = scopedFixture();
    await expect(service.create(societyId, actorId, { ...validInput, ...change })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });

  it('retains close-note limits before persistence', async () => {
    const { prisma, service } = scopedFixture();
    await expect(service.complete(societyId, actorId, permitId, 'x'.repeat(301))).rejects.toThrow('note is too long');
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });

  it.each([new Error('database unavailable'), null, 'transport error', {}])('propagates unrelated persistence failures without mislabeling overlap: %j', async failure => {
    const { tx, service } = scopedFixture();
    tx.$queryRaw.mockRejectedValue(failure);
    await expect(service.create(societyId, actorId, validInput)).rejects.toBe(failure);
  });

  it('propagates event failure and rejects absent context without a root fallback', async () => {
    const { tx, service } = scopedFixture();
    tx.$queryRaw.mockResolvedValueOnce([{ slotId, visitorId }]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: permitId }]);
    tx.$executeRaw.mockRejectedValue(new Error('Event persistence failed'));
    await expect(service.create(societyId, actorId, validInput)).rejects.toThrow('Event persistence failed');
    await expect(service.list('')).rejects.toThrow('Missing tenant context');
    await expect(service.cancel('', actorId, permitId)).rejects.toThrow('Missing tenant context');
  });
});
