import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HouseholdChangeRequestService } from './household-change-request.service';

describe('HouseholdChangeRequestService', () => {
  it('rejects a stale approval after another reviewer has claimed the request', async () => {
    const stale = {
      id: 'request-1',
      type: 'VEHICLE_ADD',
      status: 'PENDING',
      requestedByUserId: 'resident-1',
      payload: { plateNumber: 'KA01AB1234', vehicleType: 'CAR' },
      createdAt: '2026-09-10T00:00:00.000Z',
    };
    const current = { ...stale, status: 'PROCESSING' };
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      household: {
        findFirst: vi.fn().mockResolvedValue({ id: 'household-1', accessPreferences: { householdChangeRequests: [current] } }),
        update: vi.fn(),
      },
    };
    const prisma = {
      household: { findMany: vi.fn().mockResolvedValue([{ id: 'household-1', accessPreferences: { householdChangeRequests: [stale] } }]) },
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
});
