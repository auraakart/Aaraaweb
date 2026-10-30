import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
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
    const prisma = { withTenantContext: vi.fn((_scope: string, cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new ParkingService(prisma as unknown as PrismaService);

    await service.createSlot(societyId, actorId, { code: ' b2-18 ', evReady: true });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const insertSql = (tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] });
    expect(insertSql.values).toContain('B2-18');
    const eventSql = (tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(eventSql).toContain("'SLOT_CREATED'");
  });

  it('rejects invalid allocation windows before persistence', async () => {
    const prisma = { withTenantContext: vi.fn() };
    const service = new ParkingService(prisma as unknown as PrismaService);
    await expect(service.allocate(societyId, actorId, {
      slotId, householdId, vehicleId,
      startsAt: '2026-09-15T10:00:00.000Z',
      endsAt: '2026-09-15T09:00:00.000Z',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });

  it('validates active same-household vehicle before allocation', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{ id: slotId, active: true }]).mockResolvedValueOnce([]),
      $executeRaw: vi.fn(),
    };
    const prisma = { withTenantContext: vi.fn((_scope: string, cb: (client: typeof tx) => unknown) => cb(tx)) };
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
    const prisma = { withTenantContext: vi.fn((_scope: string, cb: (client: typeof tx) => unknown) => cb(tx)) };
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
    const prisma = { withTenantContext: vi.fn((_scope: string, cb: (client: typeof tx) => unknown) => cb(tx)) };
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
    const prisma = { withTenantContext: vi.fn((_scope: string, cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new ParkingService(prisma as unknown as PrismaService);
    await expect(service.release(societyId, actorId, allocationId, 'Vehicle changed')).resolves.toEqual({ id: allocationId, slotId });
    const releaseSql = (tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(releaseSql).toContain('"societyId"');
    expect(releaseSql).toContain('"endedAt" IS NULL');
    const eventSql = (tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(eventSql).toContain("'RELEASED'");
  });
});

function tenantFixture() {
  const tx = { $queryRaw: vi.fn().mockResolvedValue([]), $executeRaw: vi.fn().mockResolvedValue(1) };
  const prisma = new Proxy({ withTenantContext: vi.fn(async (scope: string, run: (client: typeof tx) => Promise<unknown>) => {
    if (scope !== societyId) throw new Error('Missing tenant context');
    return run(tx);
  }) }, { get(target, key) {
    if (key === 'withTenantContext') return target.withTenantContext;
    throw new Error(`Unscoped database access: ${String(key)}`);
  } });
  return { tx, prisma, service: new ParkingService(prisma as never) };
}

describe('Parking transaction scope', () => {
  it.each(['list', 'history'] as const)('keeps %s on the tenant client with same-society parent joins', async method => {
    const { tx, prisma, service } = tenantFixture();
    expect(await service[method](societyId)).toEqual([]);
    expect(prisma.withTenantContext).toHaveBeenCalledOnce();
    const sql = tx.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(sql.values).toContain(societyId);
    expect(sql.sql).toContain('"societyId"=');
    if (method === 'history') expect(sql.sql).toContain('LIMIT 500');
    else expect(sql.sql).toContain('hv."societyId"=pa."societyId"');
  });

  it('validates a building in the selected tenant before slot and event insertion', async () => {
    const { tx, prisma, service } = tenantFixture();
    tx.$queryRaw.mockResolvedValueOnce([{ id: householdId }]).mockResolvedValueOnce([{ id: slotId }]);
    await service.createSlot(societyId, actorId, { code: ' a1 ', buildingId: householdId, label: ' EV ', locationNote: ' Basement ', slotType: 'ACCESSIBLE', evReady: true });
    expect(prisma.withTenantContext).toHaveBeenCalledOnce();
    expect((tx.$queryRaw.mock.calls[0][0] as Prisma.Sql).values).toEqual([householdId, societyId]);
    expect((tx.$queryRaw.mock.calls[1][0] as Prisma.Sql).values).toEqual([societyId, householdId, 'A1', 'EV', 'ACCESSIBLE', true, 'Basement']);
    expect((tx.$executeRaw.mock.calls[0][0] as Prisma.Sql).values).toContain(actorId);
  });

  it('rejects a missing or foreign building before slot or event writes', async () => {
    const { tx, service } = tenantFixture();
    await expect(service.createSlot(societyId, actorId, { code: 'A1', buildingId: householdId })).rejects.toThrow('Building not found');
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it.each([{ code: '' }, { code: 'x'.repeat(61) }, { code: 'A', label: 'x'.repeat(121) }, { code: 'A', locationNote: 'x'.repeat(301) }])('validates slot metadata before context entry: %j', async input => {
    const { prisma, service } = tenantFixture();
    await expect(service.createSlot(societyId, actorId, input)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });

  it('allocates with credential policy in one context and retains the slot lock and atomic event', async () => {
    const { tx, prisma, service } = tenantFixture();
    tx.$queryRaw.mockResolvedValueOnce([{ id: slotId, active: true }]).mockResolvedValueOnce([{ id: vehicleId }])
      .mockResolvedValueOnce([{ maxActiveResidentVehicles: 3, requireCredential: true }]).mockResolvedValueOnce([{ count: 0n }])
      .mockResolvedValueOnce([{ id: householdId }]).mockResolvedValueOnce([{ id: allocationId }]);
    expect(await service.allocate(societyId, actorId, { slotId, householdId, vehicleId, startsAt: '2026-10-30T10:00:00Z', endsAt: '2026-10-30T11:00:00Z', note: ' Home ' })).toEqual({ id: allocationId });
    expect(prisma.withTenantContext).toHaveBeenCalledOnce();
    expect((tx.$queryRaw.mock.calls[0][0] as Prisma.Sql).sql).toContain('FOR UPDATE');
    expect((tx.$queryRaw.mock.calls[1][0] as Prisma.Sql).sql).toContain('FOR UPDATE OF h');
    for (const [query] of tx.$queryRaw.mock.calls) expect((query as Prisma.Sql).values).toContain(societyId);
    expect((tx.$queryRaw.mock.calls[5][0] as Prisma.Sql).values).toContain('Home');
    expect((tx.$executeRaw.mock.calls[0][0] as Prisma.Sql).values).toContain(allocationId);
  });

  it('retains default policy, start time and open-ended allocation behavior', async () => {
    const { tx, service } = tenantFixture();
    tx.$queryRaw.mockResolvedValueOnce([{ id: slotId, active: true }]).mockResolvedValueOnce([{ id: vehicleId }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: allocationId }]);
    await service.allocate(societyId, actorId, { slotId, householdId, vehicleId });
    const values = (tx.$queryRaw.mock.calls[4][0] as Prisma.Sql).values;
    expect(values).toContain(null);
    expect(values.some(value => value instanceof Date && Number.isFinite(value.getTime()))).toBe(true);
  });

  it.each([{ startsAt: 'invalid' }, { endsAt: 'invalid' }, { note: 'x'.repeat(301) }])('validates allocation metadata before context entry: %j', async change => {
    const { prisma, service } = tenantFixture();
    await expect(service.allocate(societyId, actorId, { slotId, householdId, vehicleId, ...change })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });

  it('denies absent and inactive slots before vehicle reads or writes', async () => {
    const { tx, service } = tenantFixture();
    await expect(service.allocate(societyId, actorId, { slotId, householdId, vehicleId })).rejects.toBeInstanceOf(NotFoundException);
    tx.$queryRaw.mockResolvedValueOnce([{ id: slotId, active: false }]);
    await expect(service.allocate(societyId, actorId, { slotId, householdId, vehicleId })).rejects.toThrow('Inactive');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('enforces the default household limit before allocation insertion', async () => {
    const { tx, service } = tenantFixture();
    tx.$queryRaw.mockResolvedValueOnce([{ id: slotId, active: true }]).mockResolvedValueOnce([{ id: vehicleId }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 2n }]);
    await expect(service.allocate(societyId, actorId, { slotId, householdId, vehicleId })).rejects.toThrow('limit (2)');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects missing releases and excessive release notes without audit writes', async () => {
    const { tx, service } = tenantFixture();
    await expect(service.release(societyId, actorId, allocationId)).rejects.toThrow('not found');
    await expect(service.release(societyId, actorId, allocationId, 'x'.repeat(301))).rejects.toThrow('note is too long');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('retains release normalization and active-only writes in the selected context', async () => {
    const { tx, prisma, service } = tenantFixture();
    tx.$queryRaw.mockResolvedValue([{ id: allocationId, slotId }]);
    await service.release(societyId, actorId, allocationId, ' Done ');
    expect(prisma.withTenantContext).toHaveBeenCalledOnce();
    expect((tx.$queryRaw.mock.calls[0][0] as Prisma.Sql).sql).toContain('"endedAt" IS NULL');
    expect((tx.$executeRaw.mock.calls[0][0] as Prisma.Sql).values).toContain('Done');
  });

  it.each([null, 'transport', {}, new Error('Database unavailable')])('propagates unrelated slot persistence errors: %j', async error => {
    const { tx, service } = tenantFixture();
    tx.$queryRaw.mockRejectedValue(error);
    await expect(service.createSlot(societyId, actorId, { code: 'A' })).rejects.toBe(error);
  });

  it.each([{ code: '23505' }, { code: 'P2010', meta: { code: '23505' } }])('maps native and Prisma-wrapped duplicate errors without changing other failures: %j', async error => {
    const { tx, service } = tenantFixture();
    tx.$queryRaw.mockRejectedValueOnce(error);
    await expect(service.createSlot(societyId, actorId, { code: 'A' })).rejects.toThrow('Parking slot code already exists');
    tx.$queryRaw.mockResolvedValueOnce([{ id: slotId, active: true }]).mockResolvedValueOnce([{ id: vehicleId }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockRejectedValueOnce(error);
    await expect(service.allocate(societyId, actorId, { slotId, householdId, vehicleId })).rejects.toThrow('Parking slot or vehicle already has');
  });

  it.each([{ code: 'P2010' }, { code: 'P2010', meta: { code: '42501' } }, { code: 'other', meta: { code: '23505' } }])('preserves unrelated wrapped errors: %j', async error => {
    const { tx, service } = tenantFixture();
    tx.$queryRaw.mockRejectedValueOnce(error);
    await expect(service.createSlot(societyId, actorId, { code: 'A' })).rejects.toBe(error);
  });

  it('rejects missing contexts and propagates event failures without a root fallback', async () => {
    const { tx, service } = tenantFixture();
    await expect(service.list('')).rejects.toThrow('Missing tenant context');
    await expect(service.allocate('', actorId, { slotId, householdId, vehicleId })).rejects.toThrow('Missing tenant context');
    tx.$queryRaw.mockResolvedValue([{ id: slotId }]);
    tx.$executeRaw.mockRejectedValue(new Error('Event write failed'));
    await expect(service.createSlot(societyId, actorId, { code: 'A' })).rejects.toThrow('Event write failed');
    await expect(service.release(societyId, actorId, allocationId)).rejects.toThrow('Event write failed');
  });
});
