import { AccessRequestStatus, AccessSubjectType, AuditEventType, GateMutationAction } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProductFeature } from '../entitlements/entitlement.types';
import { AccessService } from './access.service';

type Row = {
  id: string;
  societyId: string;
  unitId: string;
  requestedById: string;
  subjectType: AccessSubjectType;
  subjectName: string;
  subjectPhone: string | null;
  purpose: string | null;
  status: AccessRequestStatus;
  validFrom: Date | null;
  validUntil: Date | null;
  credentialHash: string | null;
  enteredAt: Date | null;
  exitedAt: Date | null;
  metadata?: unknown;
};

describe('Walk-in visitor approval lifecycle', () => {
  it('guard creates -> resident approves -> guard observes -> enters -> exits', async () => {
    const requests = new Map<string, Row>();
    const audits: AuditEventType[] = [];
    const receipts = new Map<string, { societyId: string; gateId: string; accessRequestId: string; actorUserId: string; idempotencyKey: string; action: GateMutationAction }>();
    let sequence = 0;

    const accessRequest = {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: Row = {
          id: `access-${++sequence}`,
          societyId: data.societyId as string,
          unitId: data.unitId as string,
          requestedById: data.requestedById as string,
          subjectType: data.subjectType as AccessSubjectType,
          subjectName: data.subjectName as string,
          subjectPhone: (data.subjectPhone as string | null | undefined) ?? null,
          purpose: (data.purpose as string | null | undefined) ?? null,
          status: data.status as AccessRequestStatus,
          validFrom: (data.validFrom as Date | undefined) ?? null,
          validUntil: (data.validUntil as Date | undefined) ?? null,
          credentialHash: (data.credentialHash as string | undefined) ?? null,
          enteredAt: null,
          exitedAt: null,
          metadata: data.metadata,
        };
        requests.set(row.id, row);
        return { ...row };
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        [...requests.values()].find((row) => {
          if (where.id != null && row.id !== where.id) return false;
          if (where.societyId != null && row.societyId !== where.societyId) return false;
          if (where.requestedById != null && row.requestedById !== where.requestedById) return false;
          return true;
        }) ?? null),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = requests.get(where.id);
        if (!row) throw new Error('not found');
        return { ...row };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const row = requests.get(where.id as string);
        if (!row || row.societyId !== where.societyId || (where.requestedById != null && row.requestedById !== where.requestedById) || (where.status != null && row.status !== where.status)) return { count: 0 };
        Object.assign(row, data);
        requests.set(row.id, row);
        return { count: 1 };
      }),
      findMany: vi.fn(async ({ where }: { where: { societyId: string } }) =>
        [...requests.values()].filter((row) => row.societyId === where.societyId).map((row) => ({ ...row }))),
    };

    const prisma = {
      unitOccupancy: {
        findFirst: vi.fn().mockResolvedValue({ id: 'resident-link' }),
        findMany: vi.fn().mockResolvedValue([{ unitId: 'unit-1' }]),
      },
      unit: {
        findMany: vi.fn().mockResolvedValue([{ id: 'unit-1', number: 'A-101', building: { id: 'building-1', name: 'A Tower', code: 'A' } }]),
        findFirst: vi.fn().mockResolvedValue({ id: 'unit-1', occupancies: [{ userId: 'resident-1' }] }),
      },
      gate: { findFirst: vi.fn().mockResolvedValue({ id: 'gate-1', societyId: 'society-1', active: true }) },
      accessRequest,
      auditEvent: { create: vi.fn(async ({ data }: { data: { event: AuditEventType } }) => { audits.push(data.event); return { id: `audit-${audits.length}` }; }) },
      gateMutationReceipt: {
        findUnique: vi.fn(async ({ where }: { where: { societyId_idempotencyKey: { societyId: string; idempotencyKey: string } } }) => receipts.get(`${where.societyId_idempotencyKey.societyId}:${where.societyId_idempotencyKey.idempotencyKey}`) ?? null),
        create: vi.fn(async ({ data }: { data: { societyId: string; gateId: string; accessRequestId: string; actorUserId: string; idempotencyKey: string; action: GateMutationAction } }) => {
          receipts.set(`${data.societyId}:${data.idempotencyKey}`, data);
          return { id: `receipt-${receipts.size}`, ...data };
        }),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
    };
    const entitlements = { isEnabled: vi.fn(async (_societyId: string, feature: ProductFeature) => feature === ProductFeature.VISITOR_MANAGEMENT) };
    const service = new AccessService(
      prisma as unknown as ConstructorParameters<typeof AccessService>[0],
      entitlements as unknown as ConstructorParameters<typeof AccessService>[1],
    );

    const units = await service.listGateUnits('society-1');
    expect(units).toHaveLength(1);

    const pending = await service.createWalkInVisitor('society-1', 'guard-1', 'gate-1', 'unit-1', 'Suresh', '9999999999', 'Meeting');
    expect(pending.status).toBe(AccessRequestStatus.PENDING);
    expect(pending.requestedById).toBe('resident-1');
    expect(pending.metadata).toEqual(expect.objectContaining({ source: 'GATE_WALK_IN', gateId: 'gate-1', createdByGuardId: 'guard-1' }));

    const residentView = await service.listMine('society-1', 'resident-1');
    expect(residentView).toHaveLength(1);
    expect(residentView[0].status).toBe(AccessRequestStatus.PENDING);

    const approved = await service.approve('society-1', 'resident-1', pending.id, new Date(Date.now() - 1000), new Date(Date.now() + 60 * 60 * 1000));
    expect(approved.request.status).toBe(AccessRequestStatus.APPROVED);

    const gateView = await service.gateRequestStatus('society-1', 'gate-1', pending.id);
    expect(gateView.status).toBe(AccessRequestStatus.APPROVED);

    await expect(service.gateRequestStatus('society-1', 'gate-2', pending.id)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.checkInRequest('society-1', 'gate-2', pending.id, 'guard-2', 'wrong-gate')).rejects.toBeInstanceOf(BadRequestException);

    const entered = await service.checkInRequest('society-1', 'gate-1', pending.id, 'guard-1', 'walkin-enter-1');
    expect(entered.status).toBe(AccessRequestStatus.CHECKED_IN);

    const exited = await service.checkOutRequest('society-1', 'gate-1', pending.id, 'guard-1', 'walkin-exit-1');
    expect(exited.status).toBe(AccessRequestStatus.CHECKED_OUT);

    expect(audits).toEqual([
      AuditEventType.ACCESS_CREATED,
      AuditEventType.ACCESS_APPROVED,
      AuditEventType.ACCESS_CHECKED_IN,
      AuditEventType.ACCESS_CHECKED_OUT,
    ]);
  });
});
