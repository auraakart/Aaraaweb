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
      findFirst: vi.fn().mockResolvedValue({ id: 'household-1', societyId: 'society-1', unitId: 'unit-1', accessPreferences: {} }),
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
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  Object.assign(prisma, {
    $transaction: vi.fn(async (operation: (tx: typeof prisma) => unknown) => operation(prisma)),
  });
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
              select: expect.objectContaining({
                id: true,
                relation: true,
                primaryGateContact: true,
                gateApprovalEnabled: true,
                gateNotificationEnabled: true,
                escalationOrder: true,
                user: {
                  select: expect.objectContaining({ id: true, name: true, phone: true, status: true }),
                },
              }),
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
    prisma.householdVehicle.findFirst.mockResolvedValueOnce(null);
    await svc.addVehicle('society-1', 'user-1', 'household-1', {
      plateNumber: 'ka 01-ab-1234',
      vehicleType: VehicleType.CAR,
    });
    expect(prisma.householdVehicle.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ plateNumber: 'KA01AB1234' }) }),
    );
    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
  });

  it('reactivates a historical vehicle row instead of violating the society plate constraint', async () => {
    const { svc, prisma } = service();
    prisma.householdVehicle.findFirst.mockResolvedValueOnce({ id: 'vehicle-old', active: false });

    await svc.addVehicle('society-1', 'user-1', 'household-1', {
      plateNumber: 'ka 01-ab-1234',
      vehicleType: VehicleType.CAR,
      color: ' Blue ',
    });

    expect(prisma.householdVehicle.create).not.toHaveBeenCalled();
    expect(prisma.householdVehicle.update).toHaveBeenCalledWith({
      where: { id: 'vehicle-old' },
      data: expect.objectContaining({ householdId: 'household-1', active: true, color: 'Blue' }),
    });
  });

  it('preserves workflow-managed JSON keys during legacy preference replacement', async () => {
    const { svc, prisma } = service();
    prisma.household.findFirst
      .mockResolvedValueOnce({ id: 'household-1', societyId: 'society-1', unitId: 'unit-1', accessPreferences: {} })
      .mockResolvedValueOnce({
        id: 'household-1',
        accessPreferences: {
          delivery: 'door',
          parkingSlots: { 'vehicle-1': 'B2-18' },
          householdChangeRequests: [{ id: 'request-1', status: 'PENDING' }],
        },
      });

    await svc.updatePreferences('society-1', 'user-1', 'household-1', {
      delivery: 'gate',
      parkingSlots: {},
      householdChangeRequests: [],
    });

    expect(prisma.household.update).toHaveBeenCalledWith({
      where: { id: 'household-1' },
      data: {
        accessPreferences: {
          delivery: 'gate',
          parkingSlots: { 'vehicle-1': 'B2-18' },
          householdChangeRequests: [{ id: 'request-1', status: 'PENDING' }],
        },
      },
    });
  });

  it('stores a society-managed parking label without changing vehicle registration data', async () => {
    const { svc, prisma } = service();
    await svc.updateVehicleParkingSlot('society-1', 'household-1', 'vehicle-1', ' B2-18 ');
    expect(prisma.household.update).toHaveBeenCalledWith({
      where: { id: 'household-1' },
      data: { accessPreferences: { parkingSlots: { 'vehicle-1': 'B2-18' } } },
    });
    expect(prisma.householdVehicle.update).not.toHaveBeenCalled();
  });

  it('scopes admin parking updates to the target household and society', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const { svc, prisma } = service({
      householdVehicle: { create: vi.fn(), findFirst, update: vi.fn() },
    });

    await expect(
      svc.updateVehicleParkingSlot('society-1', 'household-1', 'foreign-vehicle', 'B2-18'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-vehicle', householdId: 'household-1', societyId: 'society-1', active: true },
    });
    expect(prisma.household.update).not.toHaveBeenCalled();
  });

  it('rejects vehicle creation for a household outside the authenticated resident scope', async () => {
    const { svc, prisma } = service({
      household: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });

    await expect(svc.addVehicle('society-1', 'user-1', 'foreign-household', {
      plateNumber: 'KA01AB1234',
      vehicleType: VehicleType.CAR,
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.householdVehicle.create).not.toHaveBeenCalled();
  });

  it('scopes vehicle deactivation to the authenticated society and household', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const { svc, prisma } = service({
      householdVehicle: {
        create: vi.fn(),
        findFirst,
        update: vi.fn(),
      },
    });

    await expect(
      svc.deactivateVehicle('society-1', 'user-1', 'household-1', 'foreign-vehicle'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'foreign-vehicle',
        householdId: 'household-1',
        societyId: 'society-1',
        active: true,
      },
    });
    expect(prisma.householdVehicle.update).not.toHaveBeenCalled();
  });

  it('clears a family gate-approval expiry when approval authority is disabled', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'member-1', gateApprovalEnabled: false, gateApprovalExpiresAt: null });
    const { svc } = service({
      unitOwnership: { findFirst: vi.fn().mockResolvedValue({ id: 'owner-link-1' }) },
      unitOccupancy: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({
          id: 'member-1',
          unitId: 'unit-1',
          userId: 'family-1',
          societyId: 'society-1',
          active: true,
          relation: 'FAMILY_MEMBER',
          gateApprovalEnabled: true,
          gateApprovalExpiresAt: new Date(Date.now() + 86_400_000),
        }),
        updateMany: vi.fn(),
        update,
      },
    });

    await svc.updateFamilyMember('society-1', 'owner-1', 'household-1', 'member-1', {
      gateApprovalEnabled: false,
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'member-1' },
      data: expect.objectContaining({
        gateApprovalEnabled: false,
        gateApprovalExpiresAt: null,
      }),
    });
  });

  it('accepts a future family gate-approval expiry within the two-year authority window', async () => {
    const expiry = new Date(Date.now() + 30 * 86_400_000);
    const update = vi.fn().mockResolvedValue({ id: 'member-1', gateApprovalEnabled: true, gateApprovalExpiresAt: expiry });
    const { svc } = service({
      unitOwnership: { findFirst: vi.fn().mockResolvedValue({ id: 'owner-link-1' }) },
      unitOccupancy: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({
          id: 'member-1',
          unitId: 'unit-1',
          userId: 'family-1',
          societyId: 'society-1',
          active: true,
          relation: 'FAMILY_MEMBER',
          gateApprovalEnabled: true,
          gateApprovalExpiresAt: null,
        }),
        updateMany: vi.fn(),
        update,
      },
    });

    await svc.updateFamilyMember('society-1', 'owner-1', 'household-1', 'member-1', {
      gateApprovalEnabled: true,
      gateApprovalExpiresAt: expiry.toISOString(),
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'member-1' },
      data: expect.objectContaining({
        gateApprovalEnabled: true,
        gateApprovalExpiresAt: expect.any(Date),
      }),
    });
  });

  it('rejects an expired family gate-approval authority date', async () => {
    const update = vi.fn();
    const { svc } = service({
      unitOwnership: { findFirst: vi.fn().mockResolvedValue({ id: 'owner-link-1' }) },
      unitOccupancy: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({
          id: 'member-1',
          unitId: 'unit-1',
          userId: 'family-1',
          societyId: 'society-1',
          active: true,
          relation: 'FAMILY_MEMBER',
          gateApprovalEnabled: true,
          gateApprovalExpiresAt: null,
        }),
        updateMany: vi.fn(),
        update,
      },
    });

    await expect(svc.updateFamilyMember('society-1', 'owner-1', 'household-1', 'member-1', {
      gateApprovalEnabled: true,
      gateApprovalExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    })).rejects.toThrow('Gate approval expiry must be in the future');
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a family gate-approval expiry more than two years ahead', async () => {
    const update = vi.fn();
    const expiry = new Date();
    expiry.setUTCFullYear(expiry.getUTCFullYear() + 3);
    const { svc } = service({
      unitOwnership: { findFirst: vi.fn().mockResolvedValue({ id: 'owner-link-1' }) },
      unitOccupancy: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({
          id: 'member-1',
          unitId: 'unit-1',
          userId: 'family-1',
          societyId: 'society-1',
          active: true,
          relation: 'FAMILY_MEMBER',
          gateApprovalEnabled: true,
          gateApprovalExpiresAt: null,
        }),
        updateMany: vi.fn(),
        update,
      },
    });

    await expect(svc.updateFamilyMember('society-1', 'owner-1', 'household-1', 'member-1', {
      gateApprovalEnabled: true,
      gateApprovalExpiresAt: expiry.toISOString(),
    })).rejects.toThrow('Gate approval expiry cannot be more than two years in the future');
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects family-member management by a resident without verified current ownership', async () => {
    const { svc } = service({
      unitOwnership: { findFirst: vi.fn().mockResolvedValue(null) },
    });

    await expect(svc.addFamilyMember('society-1', 'tenant-1', 'household-1', {
      name: 'Family Member',
      phone: '+919876543210',
    })).rejects.toThrow('Only a verified current owner can manage family members for this unit');
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

  it('returns an exact emergency-contact same-key replay without a second insert', async () => {
    const existing = {
      id: 'contact-1',
      societyId: 'society-1',
      householdId: 'household-1',
      name: 'Anita Rao',
      phone: '+919876543210',
      relation: 'Sister',
      priority: 1,
      active: true,
      idempotencyKey: 'resident-emergency-contact-1',
    };
    const create = vi.fn();
    const { svc, prisma } = service({
      emergencyContact: {
        findFirst: vi.fn().mockResolvedValue(existing),
        create,
        update: vi.fn(),
      },
    });

    await expect(svc.addEmergencyContact('society-1', 'user-1', 'household-1', {
      name: ' anita rao ',
      phone: ' +91 98765-43210 ',
      relation: ' sister ',
      priority: 1,
      idempotencyKey: 'resident-emergency-contact-1',
    })).resolves.toEqual(existing);

    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects emergency-contact same-key replay when normalized intent changes', async () => {
    const create = vi.fn();
    const { svc } = service({
      emergencyContact: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'contact-1',
          name: 'Anita Rao',
          phone: '+919876543210',
          relation: 'Sister',
          priority: 1,
          active: true,
          idempotencyKey: 'resident-emergency-contact-2',
        }),
        create,
        update: vi.fn(),
      },
    });

    await expect(svc.addEmergencyContact('society-1', 'user-1', 'household-1', {
      name: 'Anita Rao',
      phone: '+919876543210',
      relation: 'Sister',
      priority: 2,
      idempotencyKey: 'resident-emergency-contact-2',
    })).rejects.toThrow('Idempotency key already used for a different emergency contact');
    expect(create).not.toHaveBeenCalled();
  });

  it('persists the emergency-contact request identity on the first successful create', async () => {
    const create = vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'contact-new', active: true, ...data }),
    );
    const { svc } = service({
      emergencyContact: {
        findFirst: vi.fn().mockResolvedValue(null),
        create,
        update: vi.fn(),
      },
    });

    await svc.addEmergencyContact('society-1', 'user-1', 'household-1', {
      name: 'Anita Rao',
      phone: '+919876543210',
      relation: 'Sister',
      priority: 1,
      idempotencyKey: 'resident-emergency-contact-3',
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ idempotencyKey: 'resident-emergency-contact-3' }),
    });
  });

  it('treats scoped emergency-contact deactivation replay as success', async () => {
    const update = vi.fn();
    const inactive = { id: 'contact-1', householdId: 'household-1', societyId: 'society-1', active: false };
    const { svc } = service({
      emergencyContact: {
        findFirst: vi.fn().mockResolvedValue(inactive),
        create: vi.fn(),
        update,
      },
    });

    await expect(
      svc.deactivateEmergencyContact('society-1', 'user-1', 'household-1', 'contact-1'),
    ).resolves.toEqual(inactive);
    expect(update).not.toHaveBeenCalled();
  });

});
