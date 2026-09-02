import { AccessRequestStatus, AccessSubjectType, AuditEventType } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProductFeature } from '../entitlements/entitlement.types';
import { GateArrivalService } from './gate-arrival.service';

function setup(enabled = true) {
  const prisma = {
    gate: { findFirst: vi.fn().mockResolvedValue({ id: 'gate-1', societyId: 'society-1', active: true }) },
    unit: {
      findFirst: vi.fn().mockResolvedValue({ id: 'unit-1', occupancies: [{ userId: 'resident-1' }] }),
    },
    accessRequest: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'access-1', ...data })),
    },
    auditEvent: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    $transaction: vi.fn(),
  };
  prisma.$transaction = vi.fn(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const entitlements = { isEnabled: vi.fn().mockResolvedValue(enabled) };
  return {
    service: new GateArrivalService(
      prisma as unknown as ConstructorParameters<typeof GateArrivalService>[0],
      entitlements as unknown as ConstructorParameters<typeof GateArrivalService>[1],
    ),
    prisma,
    entitlements,
  };
}

describe('GateArrivalService', () => {
  it.each([
    [AccessSubjectType.DELIVERY, 30, 'swiggy'],
    [AccessSubjectType.CAB, 15, 'ola'],
  ])('creates a pending %s request assigned to the destination resident', async (subjectType, approvalWindowMinutes, provider) => {
    const { service, prisma, entitlements } = setup();
    const result = await service.create(
      'society-1',
      'guard-1',
      'gate-1',
      'unit-1',
      subjectType,
      subjectType === AccessSubjectType.CAB ? 'Driver' : 'Delivery partner',
      provider,
      '9999999999',
      'KA01AB1234',
    );

    expect(entitlements.isEnabled).toHaveBeenCalledWith('society-1', ProductFeature.DELIVERY_MANAGEMENT);
    expect(result.status).toBe(AccessRequestStatus.PENDING);
    expect(prisma.accessRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        societyId: 'society-1',
        unitId: 'unit-1',
        requestedById: 'resident-1',
        subjectType,
        metadata: expect.objectContaining({
          source: 'GATE_QUICK_ARRIVAL',
          gateId: 'gate-1',
          createdByGuardId: 'guard-1',
          provider,
          vehicleNumber: 'KA01AB1234',
          approvalWindowMinutes,
        }),
      }),
    }));
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ event: AuditEventType.ACCESS_CREATED, gateId: 'gate-1' }),
    }));
  });

  it('rejects unsupported access types', async () => {
    const { service } = setup();
    await expect(service.create('society-1', 'guard-1', 'gate-1', 'unit-1', AccessSubjectType.VISITOR, 'Visitor')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects delivery/cab when the society feature is disabled', async () => {
    const { service } = setup(false);
    await expect(service.create('society-1', 'guard-1', 'gate-1', 'unit-1', AccessSubjectType.DELIVERY, 'Partner')).rejects.toBeInstanceOf(BadRequestException);
  });
});
