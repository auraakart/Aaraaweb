import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HouseholdChangeRequestService } from './household-change-request.service';

describe('HouseholdChangeRequestService', () => {
  it('loads the admin queue from the indexed request table', async () => {
    const findMany = vi.fn().mockResolvedValue([{
      id: 'request-1', householdId: 'household-1', type: 'VEHICLE_ADD', status: 'PENDING',
      requestedByUserId: 'resident-1', targetId: null, payload: { plateNumber: 'KA01AB1234' },
      createdAt: new Date('2026-09-10T00:00:00.000Z'), reviewedByUserId: null,
      reviewedAt: null, reviewNote: null,
      household: { unitId: 'unit-1', unit: { number: 'A-101', building: { name: 'A Wing' } } },
      requestedBy: { id: 'resident-1', name: 'Resident', phone: '+919999999999' },
    }]);
    const prisma = {
      householdChangeRequest: { findMany },
      household: { findMany: vi.fn() },
    };
    const service = new HouseholdChangeRequestService(
      prisma as unknown as ConstructorParameters<typeof HouseholdChangeRequestService>[0],
      {} as ConstructorParameters<typeof HouseholdChangeRequestService>[1],
    );

    const result = await service.listPending('society-1');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { societyId: 'society-1', status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    }));
    expect(prisma.household.findMany).not.toHaveBeenCalled();
    expect(result[0]).toEqual(expect.objectContaining({ id: 'request-1', unitNumber: 'A-101' }));
  });

  it('rejects a stale approval after another reviewer has claimed the request', async () => {
    const stale = {
      id: 'request-1',
      householdId: 'household-1',
      type: 'VEHICLE_ADD',
      status: 'PENDING',
      requestedByUserId: 'resident-1',
      targetId: null,
      payload: { plateNumber: 'KA01AB1234', vehicleType: 'CAR' },
      createdAt: new Date('2026-09-10T00:00:00.000Z'),
      reviewedByUserId: null,
      reviewedAt: null,
      reviewNote: null,
    };
    const current = { ...stale, status: 'PROCESSING' };
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      household: {
        findFirst: vi.fn().mockResolvedValue({ id: 'household-1', accessPreferences: { householdChangeRequests: [current] } }),
        update: vi.fn(),
      },
      householdChangeRequest: {
        findFirst: vi.fn().mockResolvedValue(current),
        update: vi.fn(),
        create: vi.fn(),
      },
    };
    const prisma = {
      household: { findMany: vi.fn().mockResolvedValue([{ id: 'household-1', accessPreferences: { householdChangeRequests: [stale] } }]) },
      householdChangeRequest: { findFirst: vi.fn().mockResolvedValue(stale) },
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
    };
    const households = { addVehicle: vi.fn() };
    const service = new HouseholdChangeRequestService(
      prisma as unknown as ConstructorParameters<typeof HouseholdChangeRequestService>[0],
      households as unknown as ConstructorParameters<typeof HouseholdChangeRequestService>[1],
    );

    await expect(service.approve('society-1', 'admin-2', 'request-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(households.addVehicle).not.toHaveBeenCalled();
    expect(tx.household.update).not.toHaveBeenCalled();
  });

  it('deduplicates pending vehicle requests across households under a society lock', async () => {
    const pendingVehicle = {
      id: 'request-2',
      householdId: 'household-2',
      type: 'VEHICLE_ADD',
      status: 'PENDING',
      requestedByUserId: 'resident-2',
      targetId: null,
      payload: { plateNumber: 'KA01AB1234', vehicleType: 'CAR' },
      createdAt: new Date('2026-09-10T00:00:00.000Z'),
      reviewedByUserId: null,
      reviewedAt: null,
      reviewNote: null,
    };
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      household: {
        findFirst: vi.fn().mockResolvedValue({ id: 'household-1', accessPreferences: {} }),
        update: vi.fn(),
      },
      householdChangeRequest: {
        findMany: vi.fn().mockResolvedValue([pendingVehicle]),
        create: vi.fn(),
      },
    };
    const prisma = {
      household: { findFirst: vi.fn().mockResolvedValue({ id: 'household-1', unitId: 'unit-1' }) },
      householdVehicle: { findFirst: vi.fn().mockResolvedValue(null) },
      unitOccupancy: { findFirst: vi.fn().mockResolvedValue({ id: 'occupancy-1' }) },
      unitOwnership: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
    };
    const service = new HouseholdChangeRequestService(
      prisma as unknown as ConstructorParameters<typeof HouseholdChangeRequestService>[0],
      {} as ConstructorParameters<typeof HouseholdChangeRequestService>[1],
    );

    await expect(service.requestVehicleAdd('society-1', 'resident-1', 'household-1', {
      plateNumber: 'ka 01-ab-1234',
      vehicleType: 'CAR' as never,
    })).rejects.toThrow('A matching request is already pending society approval');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.householdChangeRequest.findMany).toHaveBeenCalledWith({
      where: { societyId: 'society-1', status: { in: ['PENDING', 'PROCESSING'] } },
    });
    expect(tx.householdChangeRequest.create).not.toHaveBeenCalled();
  });

  it('dual-writes a new request to the indexed table and legacy JSON ledger', async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      household: {
        findFirst: vi.fn().mockResolvedValue({ id: 'household-1', accessPreferences: { delivery: 'door' } }),
        update: vi.fn().mockResolvedValue({ id: 'household-1' }),
      },
      householdChangeRequest: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'request-1' }),
      },
    };
    const prisma = {
      household: { findFirst: vi.fn().mockResolvedValue({ id: 'household-1', unitId: 'unit-1' }) },
      unitOwnership: { findFirst: vi.fn().mockResolvedValue({ id: 'owner-1' }) },
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
    };
    const service = new HouseholdChangeRequestService(
      prisma as unknown as ConstructorParameters<typeof HouseholdChangeRequestService>[0],
      {} as ConstructorParameters<typeof HouseholdChangeRequestService>[1],
    );

    const result = await service.requestFamilyAdd('society-1', 'owner-1', 'household-1', {
      name: ' Family Member ', phone: ' +919876543210 ',
    });

    expect(tx.householdChangeRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        societyId: 'society-1', householdId: 'household-1', requestedByUserId: 'owner-1',
        type: 'FAMILY_MEMBER_ADD', status: 'PENDING',
      }),
    });
    expect(tx.household.update).toHaveBeenCalledWith({
      where: { id: 'household-1' },
      data: { accessPreferences: expect.objectContaining({
        delivery: 'door', householdChangeRequests: [expect.objectContaining({ id: result.id })],
      }) },
    });
  });

});
