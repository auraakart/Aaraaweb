import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { HouseholdService } from './household.service';

const scope = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const householdId = '33333333-3333-4333-8333-333333333333';
const unitId = '44444444-4444-4444-8444-444444444444';
function fixture() {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    unitOccupancy: {
      findMany: vi.fn().mockResolvedValue([{ unitId }]),
      findFirst: vi.fn().mockResolvedValue({ unitId }),
    },
    household: {
      findMany: vi.fn().mockResolvedValue([{ id: householdId }]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue({ id: householdId, unitId, accessPreferences: {} }),
      create: vi.fn().mockResolvedValue({ id: householdId }),
      update: vi.fn().mockResolvedValue({ id: householdId }),
    },
  };
  const prisma = new Proxy({ withTenantContext: vi.fn(async (societyId: string, run: (client: typeof tx) => Promise<unknown>) => {
    if (societyId !== scope) throw new Error('Missing tenant context');
    return run(tx);
  }) }, { get(target, key) {
    if (key === 'withTenantContext') return target.withTenantContext;
    throw new Error(`Unscoped database access: ${String(key)}`);
  } });
  return { tx, prisma, service: new HouseholdService(prisma as never) };
}

describe('Household core tenant context', () => {
  it('lists current homes and scopes nested parents, occupants, vehicles and contacts', async () => {
    const { service, prisma, tx } = fixture();
    expect(await service.listMine(scope, userId)).toEqual([{ id: householdId }]);
    expect(prisma.withTenantContext).toHaveBeenCalledOnce();
    expect(tx.unitOccupancy.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ societyId: scope, userId, active: true, effectiveFrom: { lte: expect.any(Date) }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: expect.any(Date) } }] }) }));
    const query = tx.household.findMany.mock.calls[0][0] as unknown as Prisma.HouseholdFindManyArgs;
    expect(query.where).toEqual({ societyId: scope, unitId: { in: [unitId] }, unit: { societyId: scope, building: { societyId: scope } } });
    expect(query.include).toMatchObject({
      unit: { include: { building: true, occupancies: { where: { societyId: scope, active: true }, select: { user: { select: { id: true, name: true, phone: true, status: true } } }, orderBy: [{ primaryGateContact: 'desc' }, { escalationOrder: 'asc' }, { createdAt: 'asc' }] } } },
      vehicles: { where: { societyId: scope, active: true }, orderBy: { createdAt: 'desc' } },
      emergencyContacts: { where: { societyId: scope, active: true }, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] },
    });
    expect(query.orderBy).toEqual({ createdAt: 'asc' });
  });
  it('returns no homes when no current occupancy exists', async () => {
    const { service, tx } = fixture();
    tx.unitOccupancy.findMany.mockResolvedValue([]);
    expect(await service.listMine(scope, userId)).toEqual([]);
    expect(tx.household.findMany).not.toHaveBeenCalled();
  });
  it.each([' Home ', '', undefined])('creates a household after locking and checking current scoped occupancy: %s', async displayName => {
    const { service, tx } = fixture();
    expect(await service.create(scope, userId, unitId, displayName)).toEqual({ id: householdId });
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.household.findUnique.mock.invocationCallOrder[0]);
    expect(tx.unitOccupancy.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({ societyId: scope, userId, unitId, active: true, unit: { societyId: scope, building: { societyId: scope } } }) });
    expect(tx.household.findUnique).toHaveBeenCalledWith({ where: { unitId, societyId: scope } });
    expect(tx.household.create).toHaveBeenCalledWith({ data: { societyId: scope, unitId, displayName: displayName?.trim() || null } });
  });
  it('rejects unrelated creation before writing and retains the duplicate error', async () => {
    const { service, tx } = fixture();
    tx.unitOccupancy.findFirst.mockResolvedValueOnce(null as never);
    await expect(service.create(scope, userId, unitId)).rejects.toBeInstanceOf(BadRequestException);
    tx.household.findUnique.mockResolvedValueOnce({ id: householdId } as never);
    await expect(service.create(scope, userId, unitId)).rejects.toThrow('A household already exists for this unit');
    expect(tx.household.create).not.toHaveBeenCalled();
  });
  it('authorizes preferences in the same tenant and reads current JSON after the row lock', async () => {
    const { service, tx } = fixture();
    tx.household.findFirst.mockResolvedValueOnce({ id: householdId, unitId, accessPreferences: { stale: true } })
      .mockResolvedValueOnce({ id: householdId, unitId, accessPreferences: { parkingSlots: { vehicle: 'A1' }, householdChangeRequests: [{ id: 'pending' }] } } as never);
    await service.updatePreferences(scope, userId, householdId, { delivery: 'gate', parkingSlots: {}, householdChangeRequests: [] });
    expect(tx.household.findFirst.mock.invocationCallOrder[1]).toBeGreaterThan(tx.$executeRaw.mock.invocationCallOrder[0]);
    expect(tx.unitOccupancy.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({ societyId: scope, userId, unitId }) });
    expect(tx.household.update).toHaveBeenCalledWith({ where: { id: householdId }, data: { accessPreferences: { delivery: 'gate', parkingSlots: { vehicle: 'A1' }, householdChangeRequests: [{ id: 'pending' }] } } });
  });
  it.each([null, [], { delivery: 'door' }])('does not let clients introduce managed keys into legacy JSON: %j', async accessPreferences => {
    const { service, tx } = fixture();
    tx.household.findFirst.mockResolvedValue({ id: householdId, unitId, accessPreferences } as never);
    await service.updatePreferences(scope, userId, householdId, { delivery: 'gate', parkingSlots: { forged: 'X' }, householdChangeRequests: ['forged'] });
    expect(tx.household.update).toHaveBeenCalledWith({ where: { id: householdId }, data: { accessPreferences: { delivery: 'gate' } } });
  });
  it('denies preferences for missing homes, unrelated residents and a home removed after authorization', async () => {
    const { service, tx } = fixture();
    tx.household.findFirst.mockResolvedValueOnce(null as never);
    await expect(service.updatePreferences(scope, userId, householdId, {})).rejects.toBeInstanceOf(NotFoundException);
    tx.unitOccupancy.findFirst.mockResolvedValueOnce(null as never);
    await expect(service.updatePreferences(scope, userId, householdId, {})).rejects.toBeInstanceOf(BadRequestException);
    tx.household.findFirst.mockResolvedValueOnce({ id: householdId, unitId, accessPreferences: {} }).mockResolvedValueOnce(null as never);
    await expect(service.updatePreferences(scope, userId, householdId, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.household.update).not.toHaveBeenCalled();
  });
  it.each(['list', 'create', 'preferences'])('denies missing context for %s without root fallback', async operation => {
    const { service, tx } = fixture();
    const call = operation === 'list' ? service.listMine('', userId) : operation === 'create' ? service.create('', userId, unitId) : service.updatePreferences('', userId, householdId, {});
    await expect(call).rejects.toThrow('Missing tenant context');
    expect(tx.household.findFirst).not.toHaveBeenCalled();
    expect(tx.unitOccupancy.findMany).not.toHaveBeenCalled();
  });
  it('propagates failed transaction writes', async () => {
    const { service, tx } = fixture();
    tx.household.update.mockRejectedValue(new Error('Write failed'));
    await expect(service.updatePreferences(scope, userId, householdId, {})).rejects.toThrow('Write failed');
    tx.household.create.mockRejectedValue(new Error('Create failed'));
    await expect(service.create(scope, userId, unitId)).rejects.toThrow('Create failed');
  });
});
