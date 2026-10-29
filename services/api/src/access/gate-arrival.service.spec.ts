import { AccessRequestStatus, AccessSubjectType, AuditEventType } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProductFeature } from '../entitlements/entitlement.types';
import { GateArrivalService } from './gate-arrival.service';

function setup(enabled = true, hasApprover = true) {
  const prisma = {
    gate: { findFirst: vi.fn().mockResolvedValue({ id: 'gate-1', societyId: 'society-1', active: true }) },
    unit: {
      findFirst: vi.fn().mockResolvedValue({ id: 'unit-1', occupancies: hasApprover ? [{ userId: 'resident-1' }] : [] }),
    },
    accessRequest: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'access-1', ...data })),
    },
    auditEvent: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    withTenantContext: vi.fn(),
  };
  prisma.withTenantContext = vi.fn(async (_scope: string, callback: (tx: typeof prisma) => unknown) => callback(prisma));
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
    [AccessSubjectType.OTHER, 20, 'SCHOOL_TRANSPORT'],
  ])('creates a pending %s request assigned to the destination resident', async (subjectType, approvalWindowMinutes, provider) => {
    const { service, prisma, entitlements } = setup();
    const result = await service.create(
      'society-1',
      'guard-1',
      'gate-1',
      'unit-1',
      subjectType,
      subjectType === AccessSubjectType.CAB ? 'Driver' : subjectType === AccessSubjectType.OTHER ? 'Greenwood school bus' : 'Delivery partner',
      provider,
      '9999999999',
      'KA01AB1234',
    );

    expect(entitlements.isEnabled).toHaveBeenCalledWith('society-1', ProductFeature.DELIVERY_MANAGEMENT, prisma);
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
          ...(subjectType === AccessSubjectType.OTHER ? { transportMode: 'SCHOOL_TRANSPORT' } : {}),
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

  it('rejects generic OTHER arrivals without the school transport marker', async () => {
    const { service } = setup();
    await expect(service.create('society-1', 'guard-1', 'gate-1', 'unit-1', AccessSubjectType.OTHER, 'Unknown transport', 'OTHER')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects delivery/cab/school transport when the society feature is disabled', async () => {
    const { service } = setup(false);
    await expect(service.create('society-1', 'guard-1', 'gate-1', 'unit-1', AccessSubjectType.OTHER, 'School bus', 'SCHOOL_TRANSPORT')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects whitespace-only arrival names', async () => {
    const { service, prisma } = setup();
    await expect(service.create('society-1', 'guard-1', 'gate-1', 'unit-1', AccessSubjectType.DELIVERY, '   ')).rejects.toThrow('Gate arrival name is required');
    expect(prisma.accessRequest.create).not.toHaveBeenCalled();
  });

  it('fails closed when the destination has no current gate approver', async () => {
    const { service, prisma } = setup(true, false);
    await expect(service.create('society-1', 'guard-1', 'gate-1', 'unit-1', AccessSubjectType.CAB, 'Driver')).rejects.toThrow('Destination unit does not have an active resident');
    expect(prisma.accessRequest.create).not.toHaveBeenCalled();
    expect(prisma.unit.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        occupancies: expect.objectContaining({
          where: expect.objectContaining({
            active: true,
            gateApprovalEnabled: true,
            societyId: 'society-1',
            AND: [
              { OR: [{ effectiveTo: null }, { effectiveTo: { gt: expect.any(Date) } }] },
              { OR: [{ gateApprovalExpiresAt: null }, { gateApprovalExpiresAt: { gt: expect.any(Date) } }] },
            ],
          }),
        }),
      }),
    }));
  });
  it('uses one tenant client for validation, approver selection, request and audit', async () => {
    const { prisma: tx } = setup();
    const root = vi.fn(async () => { throw new Error('Unscoped database access'); });
    const persistence = {
      gate: { findFirst: root }, unit: { findFirst: root }, accessRequest: { create: root }, auditEvent: { create: root },
      $transaction: root,
      withTenantContext: vi.fn(async (_scope: string, run: (client: typeof tx) => Promise<unknown>) => run(tx)),
    };
    const service = new GateArrivalService(persistence as never, { isEnabled: async () => true } as never);
    await service.create('society-1', 'guard-1', 'gate-1', 'unit-1', AccessSubjectType.DELIVERY, '  Partner  ');
    expect(persistence.withTenantContext).toHaveBeenCalledOnce();
    expect(persistence.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    expect(root).not.toHaveBeenCalled();
    expect(tx.accessRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      requestedById: 'resident-1', subjectName: 'Partner', subjectPhone: null, purpose: 'Delivery',
      metadata: expect.objectContaining({ provider: null, vehicleNumber: null, approvalWindowMinutes: 30 }),
    }) });
  });

  it('rejects missing or inactive gates before selecting an approver or writing', async () => {
    const { service, prisma } = setup();
    prisma.gate.findFirst.mockResolvedValueOnce(null);
    await expect(service.create('society-1', 'guard-1', 'gate-foreign', 'unit-1', AccessSubjectType.CAB, 'Driver')).rejects.toThrow(/Gate does not belong/);
    expect(prisma.unit.findFirst).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it('preserves normalized school-transport metadata and explicit notes', async () => {
    const { service } = setup();
    const request = await service.create('society-1', 'guard-1', 'gate-1', 'unit-1', AccessSubjectType.OTHER,
      '  Bus  ', ' school_transport ', ' 9999999999 ', ' ka01ab1234 ', '  Pickup at side gate  ');
    expect(request).toMatchObject({ subjectName: 'Bus', subjectPhone: '9999999999', purpose: 'Pickup at side gate',
      metadata: { transportMode: 'SCHOOL_TRANSPORT', provider: 'school_transport', vehicleNumber: 'KA01AB1234', approvalWindowMinutes: 20 } });
  });

  it('does not fall back to a root transaction when tenant context fails', async () => {
    const { service, prisma } = setup();
    prisma.withTenantContext.mockRejectedValueOnce(new Error('Tenant context unavailable'));
    await expect(service.create('society-1', 'guard-1', 'gate-1', 'unit-1', AccessSubjectType.CAB, 'Driver')).rejects.toThrow(/context/);
    expect(prisma.gate.findFirst).not.toHaveBeenCalled();
    expect(prisma.accessRequest.create).not.toHaveBeenCalled();
  });
});