import { AccessRequestStatus, AccessSubjectType, AuditEventType, GateMutationAction } from '@prisma/client';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ProductFeature } from '../entitlements/entitlement.types';
import { AccessService } from './access.service';

type AccessRow = {
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

describe('Visitor Management end-to-end lifecycle', () => {
  it('resident invites -> guard verifies -> checks in -> checks out with audit and idempotency', async () => {
    const requests = new Map<string, AccessRow>();
    const receipts = new Map<string, { societyId: string; gateId: string; accessRequestId: string; actorUserId: string; idempotencyKey: string; action: GateMutationAction }>();
    const audits: Array<{ event: AuditEventType; accessRequestId?: string | null; gateId?: string | null }> = [];
    let sequence = 0;

    const accessRequest = {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `access-${++sequence}`;
        const row: AccessRow = {
          id,
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
        requests.set(id, row);
        return { ...row };
      }),
      findMany: vi.fn(async ({ where }: { where: { societyId: string; requestedById: string } }) =>
        [...requests.values()].filter((row) => row.societyId === where.societyId && row.requestedById === where.requestedById).map((row) => ({ ...row }))),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return [...requests.values()].find((row) => {
          if (where.id != null && row.id !== where.id) return false;
          if (where.societyId != null && row.societyId !== where.societyId) return false;
          if (where.requestedById != null && row.requestedById !== where.requestedById) return false;
          if (where.credentialHash != null && row.credentialHash !== where.credentialHash) return false;
          return true;
        }) ?? null;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const row = requests.get(where.id as string);
        if (!row || row.societyId !== where.societyId || (where.status != null && row.status !== where.status)) return { count: 0 };
        Object.assign(row, data);
        requests.set(row.id, row);
        return { count: 1 };
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = requests.get(where.id);
        if (!row) throw new Error('not found');
        return { ...row };
      }),
    };

    const prisma = {
      unitResident: { findFirst: vi.fn().mockResolvedValue({ id: 'resident-unit-1' }) },
      gate: { findFirst: vi.fn().mockResolvedValue({ id: 'gate-1', societyId: 'society-1', active: true }) },
      accessRequest,
      auditEvent: {
        create: vi.fn(async ({ data }: { data: { event: AuditEventType; accessRequestId?: string | null; gateId?: string | null } }) => {
          audits.push(data);
          return { id: `audit-${audits.length}`, ...data };
        }),
      },
      gateMutationReceipt: {
        findUnique: vi.fn(async ({ where }: { where: { societyId_idempotencyKey: { societyId: string; idempotencyKey: string } } }) =>
          receipts.get(`${where.societyId_idempotencyKey.societyId}:${where.societyId_idempotencyKey.idempotencyKey}`) ?? null),
        create: vi.fn(async ({ data }: { data: { societyId: string; gateId: string; accessRequestId: string; actorUserId: string; idempotencyKey: string; action: GateMutationAction } }) => {
          receipts.set(`${data.societyId}:${data.idempotencyKey}`, data);
          return { id: `receipt-${receipts.size}`, ...data };
        }),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
    };
    const entitlements = {
      isEnabled: vi.fn(async (_societyId: string, feature: ProductFeature) => feature === ProductFeature.VISITOR_MANAGEMENT),
    };
    const service = new AccessService(
      prisma as unknown as ConstructorParameters<typeof AccessService>[0],
      entitlements as unknown as ConstructorParameters<typeof AccessService>[1],
    );

    const validFrom = new Date(Date.now() - 1000);
    const validUntil = new Date(Date.now() + 60 * 60 * 1000);
    const invite = await service.inviteVisitor('society-1', 'resident-1', 'unit-1', 'Ravi Kumar', validFrom, validUntil, '9999999999', 'Dinner');

    expect(invite.request.status).toBe(AccessRequestStatus.APPROVED);
    expect(invite.request.subjectType).toBe(AccessSubjectType.VISITOR);
    expect(invite.credential).toEqual(expect.any(String));
    expect(invite.request.credentialHash).toBe(createHash('sha256').update(invite.credential).digest('hex'));

    const verified = await service.verify('society-1', 'gate-1', invite.credential, 'guard-1');
    expect(verified.id).toBe(invite.request.id);
    expect(verified.status).toBe(AccessRequestStatus.APPROVED);

    const checkedIn = await service.checkIn('society-1', 'gate-1', invite.credential, 'guard-1', 'enter-1');
    expect(checkedIn.status).toBe(AccessRequestStatus.CHECKED_IN);
    expect(checkedIn.enteredAt).toBeInstanceOf(Date);

    const repeatedCheckIn = await service.checkIn('society-1', 'gate-1', invite.credential, 'guard-1', 'enter-1');
    expect(repeatedCheckIn.status).toBe(AccessRequestStatus.CHECKED_IN);
    expect(receipts.size).toBe(1);

    const checkedOut = await service.checkOut('society-1', 'gate-1', invite.credential, 'guard-1', 'exit-1');
    expect(checkedOut.status).toBe(AccessRequestStatus.CHECKED_OUT);
    expect(checkedOut.exitedAt).toBeInstanceOf(Date);
    expect(receipts.size).toBe(2);

    const residentView = await service.listMine('society-1', 'resident-1');
    expect(residentView).toHaveLength(1);
    expect(residentView[0].status).toBe(AccessRequestStatus.CHECKED_OUT);

    expect(audits.map((entry) => entry.event)).toEqual([
      AuditEventType.ACCESS_CREATED,
      AuditEventType.ACCESS_APPROVED,
      AuditEventType.ACCESS_VERIFIED,
      AuditEventType.ACCESS_CHECKED_IN,
      AuditEventType.ACCESS_CHECKED_OUT,
    ]);
  });
});
