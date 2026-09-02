import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VehicleType } from '@prisma/client';
import { HouseholdService } from './household.service';

type Overrides = Record<string, unknown>;

function service(overrides: Overrides = {}) {
  const prisma = {
    unitOccupancy: {
      findMany: vi.fn().mockResolvedValue([{ unitId: 'unit-1' }]),
      findFirst: vi.fn().mockResolvedValue({ unitId: 'unit-1', userId: 'user-1', societyId: 'society-1', active: true }),
    },
    household: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue({ id: 'household-1', societyId: 'society-1', unitId: 'unit-1' }),
      create: vi.fn().mockResolvedValue({ id: 'household-1', societyId: 'society-1', unitId: 'unit-1' }),
      update: vi.fn().mockResolvedValue({ id: 'household-1' }),
    },
    householdVehicle: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'vehicle-1', ...data })),
      findFirst: vi.fn().mockResolvedValue({ id: 'vehicle-1', active: true }),
      update: vi.fn().mockResolvedValue({ id: 'vehicle-1', active: false }),
    },
    emergencyContact: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'contact-1', ...data })),
      findFirst: vi.fn().mockResolvedValue({ id: 'contact-1', active: true }),
      update: vi.fn().mockResolvedValue({ id: 'contact-1', active: false }),
    },
    ...overrides,
  };
  return {
    svc: new HouseholdService(prisma as unknown as ConstructorParameters<typeof HouseholdService>[0]),
    prisma,
  };
}

describe('HouseholdService', () => {
  it('lists only units linked to the authenticated resident', async () => {
    const { svc, prisma } = service();
    await svc.listMine('society-1', 'user-1');
    expect(prisma.household.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { societyId: 'society-1', unitId: { in: ['unit-1'] } } }),
    );
    expect(prisma.household.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        unit: expect.objectContaining({
          include: expect.objectContaining({
            occupancies: expect.objectContaining({
              where: expect.objectContaining({ active: true, effectiveFrom: expect.any(Object) }),
              select: { relation: true, primaryGateContact: true, user: { select: { id: true, name: true } } },
            }),
          }),
        }),
      }),
    }));
  });

  it('rejects household creation for an unrelated unit', async () => {
    const { svc } = service({
      unitOccupancy: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });
    await expect(svc.create('society-1', 'user-1', 'unit-x')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('prevents duplicate household profiles for a unit', async () => {
    const { svc } = service({
      unitOccupancy: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({ unitId: 'unit-1', active: true }),
      },
      household: {
        findUnique: vi.fn().mockResolvedValue({ id: 'existing' }),
      },
    });
    await expect(svc.create('society-1', 'user-1', 'unit-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('normalizes a vehicle registration before persistence', async () => {
    const { svc, prisma } = service();
    await svc.addVehicle('society-1', 'user-1', 'household-1', {
      plateNumber: 'ka 01-ab-1234',
      vehicleType: VehicleType.CAR,
    });
    expect(prisma.householdVehicle.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ plateNumber: 'KA01AB1234' }) }),
    );
  });

  it('rejects access to a household outside the tenant', async () => {
    const { svc } = service({
      household: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });
    await expect(
      svc.updatePreferences('society-1', 'user-1', 'household-x', { delivery: 'gate' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
