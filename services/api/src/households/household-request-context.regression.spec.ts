import { describe, expect, it, vi } from 'vitest';
import { HouseholdChangeRequestService } from './household-change-request.service';
const scope = '11111111-1111-4111-8111-111111111111';
function fixture() {
  let current: Record<string, unknown> | null = null;
  let preferences: Record<string, unknown> = { delivery: 'door' };
  let open = false;
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    household: {
      findFirst: vi.fn(async () => ({ id: 'home', unitId: 'unit', accessPreferences: preferences })),
      findMany: vi.fn(async () => [{ id: 'home', accessPreferences: preferences }]),
      update: vi.fn(async ({ data }: { data: { accessPreferences: Record<string, unknown> } }) => { preferences = data.accessPreferences; return { id: 'home' }; }),
    },
    unitOwnership: { findFirst: vi.fn().mockResolvedValue({ id: 'ownership' }) },
    unitOccupancy: { findFirst: vi.fn().mockResolvedValue({ id: 'occupancy' }) },
    householdVehicle: { findFirst: vi.fn().mockResolvedValue(null) },
    householdChangeRequest: {
      findFirst: vi.fn(async () => current), findMany: vi.fn(async () => current ? [current] : []),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { current = data; return current; }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { current = { ...current, ...data }; return current; }),
    },
  };
  const prisma = new Proxy({ withTenantContext: vi.fn(async (societyId: string, run: (client: typeof tx) => Promise<unknown>) => {
    expect(societyId).toBe(scope); if (open) throw new Error('Nested transaction');
    const snapshot = structuredClone({ current, preferences }); open = true;
    try { return await run(tx); } catch (error) { current = snapshot.current; preferences = snapshot.preferences; throw error; }
    finally { open = false; }
  }) }, { get(target, key) { if (key === 'withTenantContext') return target.withTenantContext; throw new Error(`Unscoped database access: ${String(key)}`); } });
  const households = {
    listMine: vi.fn(async () => [{ id: 'home', unitId: 'unit', accessPreferences: preferences }]),
    addVehicle: vi.fn(async () => { expect(open).toBe(false); return { id: 'vehicle' }; }),
    deactivateVehicle: vi.fn(async () => { expect(open).toBe(false); }),
    addFamilyMember: vi.fn(async () => { expect(open).toBe(false); }),
    deactivateFamilyMember: vi.fn(async () => { expect(open).toBe(false); }),
  };
  return { tx, prisma, households, service: new HouseholdChangeRequestService(prisma as never, households as never), state: () => ({ current, preferences }),
    legacy: (value: unknown[]) => { preferences = { delivery: 'door', householdChangeRequests: value }; } };
}
const add = (f: ReturnType<typeof fixture>) => f.service.requestVehicleAdd(scope, 'resident', 'home', { plateNumber: ' tn 01-ab 1234 ', vehicleType: 'CAR' });
describe('Household request tenant transaction boundaries', () => {
  it.each(['family-add', 'family-remove', 'vehicle-add', 'vehicle-remove'])('scopes authorization, target lookup and dual writes for %s', async operation => {
    const f = fixture();
    if (operation === 'family-add') await f.service.requestFamilyAdd(scope, 'owner', 'home', { name: ' Family ', phone: ' 999 ' });
    if (operation === 'family-remove') await f.service.requestFamilyRemove(scope, 'owner', 'home', 'member');
    if (operation === 'vehicle-add') await add(f);
    if (operation === 'vehicle-remove') {
      f.tx.householdVehicle.findFirst.mockResolvedValue({ id: 'vehicle', plateNumber: 'TN01AB1234' } as never);
      await f.service.requestVehicleRemove(scope, 'resident', 'home', 'vehicle');
    }
    expect(f.prisma.withTenantContext).toHaveBeenCalledOnce();
    expect(f.state().preferences).toMatchObject({ delivery: 'door', householdChangeRequests: [expect.objectContaining({ status: 'PENDING' })] });
    expect(f.tx.$executeRaw.mock.calls[0].slice(1)).toEqual(['home', scope]);
    expect(f.tx.household.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'home', societyId: scope, unit: { societyId: scope, building: { societyId: scope } } } }));
  });
  it('keeps delegation outside claim and completion and prevents repeated work', async () => {
    const f = fixture(); const request = await add(f);
    expect((await f.service.approve(scope, 'reviewer', request.id, ' Approved ')).status).toBe('APPROVED');
    expect(f.state().current).toMatchObject({ status: 'APPROVED', reviewNote: 'Approved', reviewedByUserId: 'reviewer' });
    await expect(f.service.approve(scope, 'other', request.id)).rejects.toThrow('Only pending');
    await expect(f.service.reject(scope, 'other', request.id)).rejects.toThrow('Only pending');
    expect(f.households.addVehicle).toHaveBeenCalledOnce();
  });
  it('resets failed mutation to PENDING and permits a subsequent approval', async () => {
    const f = fixture(); const request = await add(f);
    f.households.addVehicle.mockRejectedValueOnce(new Error('Business failure'));
    await expect(f.service.approve(scope, 'reviewer', request.id)).rejects.toThrow('Business failure');
    expect(f.state().current?.status).toBe('PENDING');
    await f.service.approve(scope, 'reviewer', request.id);
    expect(f.state().current?.status).toBe('APPROVED');
  });
  it('retains PROCESSING after successful mutation and failed final bookkeeping', async () => {
    const f = fixture(); const request = await add(f); const update = f.tx.household.update.getMockImplementation()!;
    f.tx.household.update.mockImplementation(async args => {
      if (f.state().current?.status === 'APPROVED') throw new Error('Bookkeeping failure');
      return update(args);
    });
    await expect(f.service.approve(scope, 'reviewer', request.id)).rejects.toThrow('Bookkeeping failure');
    expect(f.state().current?.status).toBe('PROCESSING');
    await expect(f.service.approve(scope, 'reviewer', request.id)).rejects.toThrow('Only pending');
    expect(f.households.addVehicle).toHaveBeenCalledOnce();
  });
  it('rejects without delegation and merges indexed results over legacy history', async () => {
    const f = fixture(); const request = await add(f); await f.service.reject(scope, 'reviewer', request.id, ' Declined ');
    expect(await f.service.listMine(scope, 'resident')).toEqual([expect.objectContaining({ id: request.id, status: 'REJECTED', reviewNote: 'Declined', householdId: 'home', unitId: 'unit' })]);
    expect(f.households.addVehicle).not.toHaveBeenCalled();
  });
  it('backfills legacy records inside tenant scope on rejection', async () => {
    const f = fixture();
    f.legacy([{ id: 'legacy', type: 'VEHICLE_REMOVE', status: 'PENDING', requestedByUserId: 'resident', payload: {}, createdAt: new Date().toISOString() }]);
    expect((await f.service.reject(scope, 'reviewer', 'legacy')).status).toBe('REJECTED');
    expect(f.tx.household.findMany).toHaveBeenCalledWith({ where: { societyId: scope, unit: { societyId: scope, building: { societyId: scope } } }, select: { id: true, accessPreferences: true } });
    expect(f.state().current).toMatchObject({ id: 'legacy', societyId: scope, status: 'REJECTED' });
  });
  it('rolls back indexed insertion when the JSON write fails', async () => {
    const f = fixture(); f.tx.household.update.mockRejectedValueOnce(new Error('JSON write failure'));
    await expect(add(f)).rejects.toThrow('JSON write failure'); expect(f.tx.householdChangeRequest.create).toHaveBeenCalledOnce();
    expect(f.state()).toEqual({ current: null, preferences: { delivery: 'door' } });
  });
  it('retains society-wide vehicle deduplication and normalization', async () => {
    const f = fixture(); await add(f); await expect(add(f)).rejects.toThrow('matching request');
    expect(f.state().current).toMatchObject({ payload: { plateNumber: 'TN01AB1234', make: null, model: null, color: null } });
    expect(f.tx.householdChangeRequest.findMany).toHaveBeenCalledWith({ where: { societyId: scope, status: { in: ['PENDING', 'PROCESSING'] } } });
  });
  it('fails missing scoped lookup without mutation', async () => {
    const f = fixture(); await expect(f.service.reject(scope, 'reviewer', 'missing')).rejects.toThrow('not found');
    expect(f.tx.householdChangeRequest.update).not.toHaveBeenCalled();
  });
});
