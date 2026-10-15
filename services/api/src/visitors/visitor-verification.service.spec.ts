import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { VisitorVerificationService } from './visitor-verification.service';

const pass = {
  id: 'pass-1',
  visitorId: 'visitor-1',
  status: 'ACTIVE',
  validFrom: new Date(Date.now() - 60_000),
  validUntil: new Date(Date.now() + 60_000),
  credentialHash: createHash('sha256').update('secret').digest('hex'),
  checkedInAt: null,
  checkedOutAt: null,
  visitor: { id: 'visitor-1', name: 'Test Visitor', status: 'APPROVED' },
};

type Overrides = Record<string, unknown>;

function service(overrides: Overrides = {}) {
  const gate = {
    findFirst: vi.fn().mockResolvedValue({ id: 'gate-1', societyId: 'society-1', active: true }),
    ...((overrides.gate as Record<string, unknown> | undefined) ?? {}),
  };
  const visitorPass = {
    findFirst: vi.fn().mockResolvedValue(pass),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ ...pass, status: 'USED', checkedInAt: new Date(), visitor: { ...pass.visitor, status: 'CHECKED_IN' } }),
    ...((overrides.visitorPass as Record<string, unknown> | undefined) ?? {}),
  };
  const visitor = {
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    ...((overrides.visitor as Record<string, unknown> | undefined) ?? {}),
  };
  const auditEvent = {
    create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    ...((overrides.auditEvent as Record<string, unknown> | undefined) ?? {}),
  };
  const transactionClient = { gate, visitorPass, visitor, auditEvent };
  const prisma = {
    gate,
    visitorPass,
    visitor,
    auditEvent,
    $transaction: vi.fn(async (callback: (tx: typeof transactionClient) => Promise<unknown>) => callback(transactionClient)),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  return {
    svc: new VisitorVerificationService(
      prisma as unknown as ConstructorParameters<typeof VisitorVerificationService>[0],
      audit as unknown as ConstructorParameters<typeof VisitorVerificationService>[1],
    ),
    prisma,
    audit,
  };
}

describe('VisitorVerificationService', () => {
  it('rejects a gate outside the tenant or inactive', async () => {
    const { svc } = service({ gate: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(svc.verify('society-1', 'gate-x', 'secret')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown credential', async () => {
    const { svc } = service({ visitorPass: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(svc.verify('society-1', 'gate-1', 'wrong')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a pass when the visitor is no longer approved', async () => {
    const { svc } = service({
      visitorPass: { findFirst: vi.fn().mockResolvedValue({ ...pass, visitor: { ...pass.visitor, status: 'CANCELLED' } }) },
    });
    await expect(svc.verify('society-1', 'gate-1', 'secret')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('checks in an active approved visitor and synchronizes visitor state', async () => {
    const { svc, prisma } = service();
    await svc.checkIn('society-1', 'gate-1', 'secret');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.visitorPass.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'pass-1', status: 'ACTIVE' }),
      data: expect.objectContaining({ status: 'USED' }),
    }));
    expect(prisma.visitor.updateMany).toHaveBeenCalledWith({
      where: { id: 'visitor-1', societyId: 'society-1', status: 'APPROVED' },
      data: { status: 'CHECKED_IN' },
    });
  });

  it('does not check out a pass already checked out', async () => {
    const { svc } = service({ visitorPass: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(svc.checkOut('society-1', 'gate-1', 'secret')).rejects.toBeInstanceOf(NotFoundException);
  });
});
