import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VehicleType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { HouseholdService } from './household.service';

const scope = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const input = { plateNumber: ' tn 01-ab 1234 ', vehicleType: VehicleType.CAR, make: ' Make ', model: ' Model ', color: ' Blue ' };
function fixture() {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    household: {
      findFirst: vi.fn().mockResolvedValue({ id: 'home', unitId: 'unit', accessPreferences: { delivery: 'door', householdChangeRequests: [{ id: 'request' }], parkingSlots: { vehicle: 'A1', other: 'B1' } } }),
      update: vi.fn().mockResolvedValue({ id: 'home' }),
    },
    unitOccupancy: { findFirst: vi.fn().mockResolvedValue({ id: 'occupancy' }) },
    householdVehicle: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'vehicle' }),
      update: vi.fn().mockResolvedValue({ id: 'vehicle', active: false }),
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

describe('Household vehicle tenant context', () => {
  it('authorizes, normalizes and serializes registration through one scoped client', async () => {
    const { service, tx, prisma } = fixture();
    expect(await service.addVehicle(scope, userId, 'home', input)).toEqual({ id: 'vehicle' });
    expect(prisma.withTenantContext).toHaveBeenCalledOnce();
    expect(tx.unitOccupancy.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({ societyId: scope, userId, unitId: 'unit', active: true, unit: { societyId: scope, building: { societyId: scope } } }) });
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.householdVehicle.findFirst.mock.invocationCallOrder[0]);
    const [strings, lockKey] = tx.$executeRaw.mock.calls[0] as unknown as [TemplateStringsArray, string];
    expect(strings.join('')).toContain('pg_advisory_xact_lock');
    expect(lockKey).toBe(`vehicle:${scope}:TN01AB1234`);
    expect(tx.householdVehicle.findFirst).toHaveBeenCalledWith({ where: { societyId: scope, plateNumber: 'TN01AB1234' } });
    expect(tx.householdVehicle.create).toHaveBeenCalledWith({ data: { societyId: scope, householdId: 'home', plateNumber: 'TN01AB1234', vehicleType: 'CAR', make: 'Make', model: 'Model', color: 'Blue' } });
  });
  it('retains historical row identity and normalizes blank optional metadata during reactivation', async () => {
    const { service, tx } = fixture();
    tx.householdVehicle.findFirst.mockResolvedValue({ id: 'historical', active: false } as never);
    await service.addVehicle(scope, userId, 'home', { plateNumber: 'tn01', vehicleType: VehicleType.CAR, make: '', model: ' ', color: '' });
    expect(tx.householdVehicle.update).toHaveBeenCalledWith({ where: { id: 'historical' }, data: { householdId: 'home', vehicleType: 'CAR', make: null, model: null, color: null, active: true } });
    expect(tx.householdVehicle.create).not.toHaveBeenCalled();
  });
  it('rejects an empty normalized plate and an already active registration', async () => {
    const { service, tx } = fixture();
    await expect(service.addVehicle(scope, userId, 'home', { ...input, plateNumber: ' - ' })).rejects.toThrow('registration number is required');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    tx.householdVehicle.findFirst.mockResolvedValue({ id: 'existing', active: true } as never);
    await expect(service.addVehicle(scope, userId, 'home', input)).rejects.toThrow('already registered');
    expect(tx.householdVehicle.create).not.toHaveBeenCalled();
    expect(tx.householdVehicle.update).not.toHaveBeenCalled();
  });
  it('locks before reading preferences and atomically clears only the selected label before deactivation', async () => {
    const { service, tx, prisma } = fixture();
    tx.householdVehicle.findFirst.mockResolvedValue({ id: 'vehicle', active: true } as never);
    expect(await service.deactivateVehicle(scope, userId, 'home', 'vehicle')).toEqual({ id: 'vehicle', active: false });
    expect(prisma.withTenantContext).toHaveBeenCalledOnce();
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.household.findFirst.mock.invocationCallOrder[0]);
    expect(tx.householdVehicle.findFirst).toHaveBeenCalledWith({ where: { id: 'vehicle', householdId: 'home', societyId: scope, active: true } });
    expect(tx.household.update).toHaveBeenCalledWith({ where: { id: 'home' }, data: { accessPreferences: { delivery: 'door', householdChangeRequests: [{ id: 'request' }], parkingSlots: { other: 'B1' } } } });
    expect(tx.householdVehicle.update).toHaveBeenCalledWith({ where: { id: 'vehicle' }, data: { active: false } });
  });
  it.each(['add', 'remove'])('rejects missing context for %s without a root fallback', async operation => {
    const { service, tx } = fixture();
    await expect(operation === 'add' ? service.addVehicle('', userId, 'home', input) : service.deactivateVehicle('', userId, 'home', 'vehicle')).rejects.toThrow('Missing tenant context');
    expect(tx.household.findFirst).not.toHaveBeenCalled();
  });
  it.each(['add', 'remove'])('retains missing-household and expired/unrelated-occupant denial for %s', async operation => {
    const { service, tx } = fixture();
    const run = () => operation === 'add' ? service.addVehicle(scope, userId, 'home', input) : service.deactivateVehicle(scope, userId, 'home', 'vehicle');
    tx.household.findFirst.mockResolvedValueOnce(null as never);
    await expect(run()).rejects.toBeInstanceOf(NotFoundException);
    tx.unitOccupancy.findFirst.mockResolvedValue(null as never);
    await expect(run()).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.householdVehicle.create).not.toHaveBeenCalled();
    expect(tx.household.update).not.toHaveBeenCalled();
  });
  it('denies missing/foreign/inactive vehicles before changing JSON', async () => {
    const { service, tx } = fixture();
    await expect(service.deactivateVehicle(scope, userId, 'home', 'foreign')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.household.update).not.toHaveBeenCalled();
    expect(tx.householdVehicle.update).not.toHaveBeenCalled();
  });
  it('does not deactivate when the label write fails and propagates vehicle write errors', async () => {
    const { service, tx } = fixture();
    tx.householdVehicle.findFirst.mockResolvedValue({ id: 'vehicle', active: true } as never);
    tx.household.update.mockRejectedValueOnce(new Error('Label write failed'));
    await expect(service.deactivateVehicle(scope, userId, 'home', 'vehicle')).rejects.toThrow('Label write failed');
    expect(tx.householdVehicle.update).not.toHaveBeenCalled();
    tx.householdVehicle.update.mockRejectedValueOnce(new Error('Vehicle write failed'));
    await expect(service.deactivateVehicle(scope, userId, 'home', 'vehicle')).rejects.toThrow('Vehicle write failed');
    expect(tx.household.update).toHaveBeenCalledTimes(2);
  });
});
