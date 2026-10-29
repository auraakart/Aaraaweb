import { AuditEventType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { VisitorService } from './visitor.service';
import { VisitorVerificationService } from './visitor-verification.service';
import { GateAuditService } from '../gates/gate-audit.service';

function fixture() {
  const visitor = { id: 'visit', societyId: 'society', hostUserId: 'host', status: 'PENDING' };
  const tx = {
    unitOccupancy: { findFirst: vi.fn().mockResolvedValue({ id: 'occupancy' }) },
    visitor: {
      findFirst: vi.fn().mockResolvedValue(visitor), findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(visitor), updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(visitor),
    },
    visitorPass: {
      create: vi.fn().mockResolvedValue({ id: 'pass' }), updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue({ id: 'pass', visitorId: 'visit', status: 'ACTIVE', validFrom: new Date(0), validUntil: new Date(Date.now() + 60_000), visitor: { ...visitor, status: 'APPROVED' } }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'pass' }),
    },
    gate: { findFirst: vi.fn().mockResolvedValue({ id: 'gate' }) },
    auditEvent: { create: vi.fn().mockResolvedValue({ id: 'audit' }), findMany: vi.fn().mockResolvedValue([]) },
  };
  const root = new Proxy({ withTenantContext: vi.fn(async (scope: string, run: (client: typeof tx) => Promise<unknown>) => {
    if (scope !== 'society') throw new Error('Missing tenant context');
    return run(tx);
  }) }, { get(target, key) {
    if (key === 'withTenantContext') return target.withTenantContext;
    throw new Error(`Unscoped database access: ${String(key)}`);
  } });
  const audit = new GateAuditService(root as never);
  return { tx, root, audit, visitors: new VisitorService(root as never), verification: new VisitorVerificationService(root as never, audit) };
}

describe('Visitor tenant scope regression', () => {
  it('runs every host request and pass operation without root database access', async () => {
    const { visitors, root } = fixture();
    const from = new Date(0), until = new Date(Date.now() + 60_000);
    await visitors.createRequest('society', 'host', 'unit', 'Visitor');
    await visitors.createPass('society', 'host', 'unit', 'Visitor', '999', from, until);
    await visitors.listForHost('society', 'host');
    await visitors.approve('society', 'host', 'visit', from, until);
    await visitors.deny('society', 'host', 'visit');
    await visitors.cancel('society', 'host', 'visit');
    expect(root.withTenantContext).toHaveBeenCalledTimes(6);
  });

  it('shares the verification transaction with the real audit service and scopes audit listing', async () => {
    const { verification, audit, tx, root } = fixture();
    await verification.verify('society', 'gate', 'credential', 'guard');
    expect(root.withTenantContext).toHaveBeenCalledTimes(1);
    expect(tx.auditEvent.create).toHaveBeenCalledWith({ data: { societyId: 'society', actorUserId: 'guard', gateId: 'gate', event: AuditEventType.VISITOR_VERIFIED, visitorPassId: 'pass' } });
    await audit.record('society', 'guard', 'gate', AuditEventType.VISITOR_VERIFIED, 'pass');
    await audit.list('society', 'gate', 500);
    expect(tx.auditEvent.findMany).toHaveBeenLastCalledWith({ where: { societyId: 'society', gateId: 'gate' }, orderBy: { occurredAt: 'desc' }, take: 100 });
    await audit.list('society', undefined, 0);
    expect(tx.auditEvent.findMany).toHaveBeenLastCalledWith({ where: { societyId: 'society' }, orderBy: { occurredAt: 'desc' }, take: 1 });
    await audit.list('society');
    expect(tx.auditEvent.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 50 }));
    tx.gate.findFirst.mockResolvedValueOnce(null);
    await expect(audit.record('society', 'guard', 'foreign', AuditEventType.VISITOR_VERIFIED, 'pass')).rejects.toThrow('Gate does not belong');
  });

  it('checks in and out through scoped clients, and fails closed without a tenant', async () => {
    const { verification, visitors, tx, root } = fixture();
    await verification.checkIn('society', 'gate', 'credential', 'guard');
    tx.visitorPass.findFirst.mockResolvedValueOnce({ id: 'pass', visitorId: 'visit', status: 'USED', validFrom: new Date(0), validUntil: new Date(), visitor: { id: 'visit', societyId: 'society', hostUserId: 'host', status: 'CHECKED_IN' } });
    await verification.checkOut('society', 'gate', 'credential', 'guard');
    expect(root.withTenantContext).toHaveBeenCalledTimes(2);
    await expect(visitors.listForHost('', 'host')).rejects.toThrow('Missing tenant context');
    await expect(verification.verify('', 'gate', 'credential')).rejects.toThrow('Missing tenant context');
  });
});
