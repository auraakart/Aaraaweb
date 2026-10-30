import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { HouseholdService } from './household.service';
import { ParkingAdminController } from './parking-admin.controller';

const scope = '11111111-1111-4111-8111-111111111111';
function fixture(preferences: unknown = {}) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    household: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({ id: 'home', accessPreferences: preferences }),
      update: vi.fn().mockResolvedValue({ id: 'home' }),
    },
    householdVehicle: { findFirst: vi.fn().mockResolvedValue({ id: 'vehicle' }) },
  };
  const prisma = new Proxy({ withTenantContext: vi.fn(async (societyId: string, run: (client: typeof tx) => Promise<unknown>) => {
    if (societyId !== scope) throw new Error('Missing tenant context');
    return run(tx);
  }) }, { get(target, key) {
    if (key === 'withTenantContext') return target.withTenantContext;
    throw new Error(`Unscoped database access: ${String(key)}`);
  } });
  const service = new HouseholdService(prisma as never);
  return { tx, prisma, service, controller: new ParkingAdminController(prisma as never, service) };
}

describe('Parking admin tenant context', () => {
  it('retains list fields, sorting, label parsing and explicit parent/vehicle scope', async () => {
    const { tx, controller } = fixture();
    const unit = { id: 'unit', number: '1', building: { id: 'building' } }, vehicle = { id: 'vehicle', plateNumber: 'TN01' };
    tx.household.findMany.mockResolvedValue([{ id: 'home', unit, vehicles: [vehicle], accessPreferences: { parkingSlots: { vehicle: 'B1', invalid: 42 } } }] as never);
    expect(await controller.list(scope)).toEqual([{ householdId: 'home', unit, vehicle, parkingSlot: 'B1' }]);
    expect(tx.household.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { societyId: scope, unit: { societyId: scope, building: { societyId: scope } } },
      select: expect.objectContaining({ vehicles: expect.objectContaining({ where: { societyId: scope, active: true }, orderBy: { createdAt: 'desc' } }) }),
      orderBy: { unit: { number: 'asc' } },
    }));
  });
  it.each([null, [], { parkingSlots: [] }, { parkingSlots: { vehicle: 42 } }])('tolerates malformed preferences: %j', async accessPreferences => {
    const { tx, controller } = fixture();
    tx.household.findMany.mockResolvedValue([{ id: 'home', unit: {}, vehicles: [{ id: 'vehicle' }], accessPreferences }] as never);
    expect(await controller.list(scope)).toEqual([expect.objectContaining({ parkingSlot: null })]);
  });
  it.each([' B2 ', '', undefined])('locks before reading and preserves unrelated JSON keys: %s', async label => {
    const { tx, controller } = fixture({ delivery: 'door', householdChangeRequests: [{ id: 'request' }], parkingSlots: { other: 'A1', vehicle: 'old', invalid: 42 } });
    expect(await controller.update('home', 'vehicle', { parkingSlot: label }, scope)).toEqual({ vehicleId: 'vehicle', parkingSlot: label?.trim() || null });
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.household.findFirst.mock.invocationCallOrder[0]);
    expect(tx.householdVehicle.findFirst).toHaveBeenCalledWith({ where: { id: 'vehicle', householdId: 'home', societyId: scope, active: true } });
    expect(tx.household.update).toHaveBeenCalledWith({ where: { id: 'home' }, data: { accessPreferences: {
      delivery: 'door', householdChangeRequests: [{ id: 'request' }], parkingSlots: label?.trim() ? { other: 'A1', vehicle: 'B2' } : { other: 'A1' },
    } } });
  });
  it.each(['household', 'householdVehicle'] as const)('denies missing/foreign/inactive %s', async model => {
    const { tx, service } = fixture();
    tx[model].findFirst.mockResolvedValue(null as never);
    await expect(service.updateVehicleParkingSlot(scope, 'home', 'vehicle', 'B1')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.household.update).not.toHaveBeenCalled();
  });
  it('propagates write failures', async () => {
    const { tx, service } = fixture();
    tx.household.update.mockRejectedValue(new Error('Write failed'));
    await expect(service.updateVehicleParkingSlot(scope, 'home', 'vehicle', 'B1')).rejects.toThrow('Write failed');
  });
  it('rejects absent context without root fallback', async () => {
    const { controller, service, tx } = fixture();
    await expect(controller.list('')).rejects.toThrow('Missing tenant context');
    await expect(service.updateVehicleParkingSlot('', 'home', 'vehicle', 'B1')).rejects.toThrow('Missing tenant context');
    expect(tx.household.findFirst).not.toHaveBeenCalled();
    expect(tx.household.findMany).not.toHaveBeenCalled();
  });
});
