import { AccessRequestStatus, AccessSubjectType, GateMutationAction } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AccessService } from './access.service';
import { EntitlementService } from '../entitlements/entitlement.service';

function fixture() {
  const row = { id: 'request', societyId: 'society', unitId: 'unit', requestedById: 'resident',
    subjectType: AccessSubjectType.VISITOR, status: AccessRequestStatus.APPROVED, metadata: {},
    validFrom: new Date(Date.now() - 60_000), validUntil: new Date(Date.now() + 3_600_000) };
  const tx = {
    society: { findFirst: vi.fn().mockResolvedValue({ productTier: 'ENTERPRISE', featureOverrides: {} }) },
    unitOccupancy: { findFirst: vi.fn().mockResolvedValue({ id: 'occupancy' }), findMany: vi.fn().mockResolvedValue([{ unitId: 'unit' }]) },
    gate: { findFirst: vi.fn().mockResolvedValue({ id: 'gate' }) },
    unit: { findFirst: vi.fn().mockResolvedValue({ id: 'unit', occupancies: [{ userId: 'resident' }] }), findMany: vi.fn().mockResolvedValue([]) },
    accessRequest: { findFirst: vi.fn().mockResolvedValue(row), findMany: vi.fn().mockResolvedValue([]),
      findUniqueOrThrow: vi.fn().mockResolvedValue(row), updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'request', ...data })) },
    gateMutationReceipt: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'receipt' }) },
    auditEvent: { create: vi.fn().mockResolvedValue({ id: 'audit' }) }, $executeRaw: vi.fn().mockResolvedValue(1),
  };
  const events: string[] = [];
  const root = new Proxy({ withTenantContext: vi.fn(async (scope: string, run: (client: typeof tx) => Promise<unknown>) => {
    if (scope !== 'society') throw new Error('Missing tenant context');
    let active = true;
    events.push('begin');
    const client = new Proxy(tx, { get(target, property) {
      if (!active) throw new Error('Transaction already closed');
      return Reflect.get(target, property);
    } });
    try { const result = await run(client); events.push('commit'); return result; }
    catch (error) { events.push('rollback'); throw error; }
    finally { active = false; }
  }) }, { get(target, property) {
    if (property === 'withTenantContext') return target.withTenantContext;
    throw new Error(`Unscoped database access: ${String(property)}`);
  } });
  return { row, tx, root, events, service: new AccessService(root as never, new EntitlementService(root as never)) };
}
const window = () => [new Date(Date.now() - 1000), new Date(Date.now() + 60_000)] as const;

describe('Access tenant transaction regression', () => {
  it('keeps resident creation, invitation, listings and decisions off the root client', async () => {
    const { service, tx, root } = fixture();
    await service.create('society', 'resident', 'unit', AccessSubjectType.VISITOR, ' Visitor ');
    await service.inviteVisitor('society', 'resident', 'unit', 'Visitor', ...window(), 'invite');
    await service.listMine('society', 'resident');
    await service.listGateUnits('society');
    tx.accessRequest.findFirst.mockResolvedValue({ ...fixture().row, status: AccessRequestStatus.PENDING });
    await service.approve('society', 'resident', 'request', ...window());
    await service.deny('society', 'resident', 'request');
    await service.cancel('society', 'resident', 'request');
    expect(root.withTenantContext).toHaveBeenCalledTimes(7);
    expect(tx.society.findFirst).toHaveBeenCalledTimes(3);
  });

  it('keeps walk-in destination, feature, gate and audit operations in one context', async () => {
    const { service, tx, root } = fixture();
    await service.createWalkInVisitor('society', 'guard', 'gate', 'unit', ' Visitor ');
    expect(root.withTenantContext).toHaveBeenCalledTimes(1);
    expect(tx.unit.findFirst).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ occupancies: expect.objectContaining({ where: expect.objectContaining({ societyId: 'society' }) }) }) }));
    expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorUserId: 'guard', gateId: 'gate', event: 'ACCESS_CREATED' }) }));
  });

  it('scopes gate status and verification with their real entitlement read and audit', async () => {
    const { service, tx, root } = fixture();
    await service.gateRequestStatus('society', 'gate', 'request');
    await service.verify('society', 'gate', 'credential', 'guard');
    await service.verify('society', 'gate', 'credential');
    expect(root.withTenantContext).toHaveBeenCalledTimes(3);
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it.each(['checkIn', 'checkOut', 'checkInRequest', 'checkOutRequest'] as const)('runs %s lookup, receipt and audit in one tenant context', async method => {
    const { service, tx, root } = fixture();
    await service[method]('society', 'gate', 'request-or-credential', 'guard', 'key');
    expect(root.withTenantContext).toHaveBeenCalledTimes(1);
    expect(tx.gateMutationReceipt.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ societyId: 'society', accessRequestId: 'request', gateId: 'gate', idempotencyKey: 'key' }) }));
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('recovers a competing committed receipt only after the failed transaction has rolled back', async () => {
    const { service, tx, root, events } = fixture();
    tx.accessRequest.updateMany.mockResolvedValue({ count: 0 });
    tx.gateMutationReceipt.findUnique.mockImplementation(async () => {
      events.push('receipt');
      return events.includes('rollback') ? { accessRequestId: 'request', gateId: 'gate', action: GateMutationAction.CHECK_IN } : null;
    });
    await service.checkIn('society', 'gate', 'credential', 'guard', 'key');
    expect(events).toEqual(['begin', 'receipt', 'rollback', 'begin', 'receipt', 'commit']);
    expect(root.withTenantContext).toHaveBeenCalledTimes(2);
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('preserves a mutation failure when no competing receipt committed', async () => {
    const { service, tx, events } = fixture();
    tx.gateMutationReceipt.create.mockRejectedValue(new Error('Receipt persistence failed'));
    await expect(service.checkIn('society', 'gate', 'credential', 'guard', 'key')).rejects.toThrow('Receipt persistence failed');
    expect(events).toEqual(['begin', 'rollback', 'begin', 'commit']);
  });

  it('rejects absent or foreign gate, credential and conflicting keys without entering recovery', async () => {
    for (const condition of ['gate', 'credential', 'key', 'binding'] as const) {
      const { service, tx, root } = fixture();
      if (condition === 'gate') tx.gate.findFirst.mockResolvedValue(null);
      if (condition === 'credential') tx.accessRequest.findFirst.mockResolvedValue(null);
      if (condition === 'binding') tx.gateMutationReceipt.findUnique.mockResolvedValue({ accessRequestId: 'foreign', gateId: 'gate', action: 'CHECK_IN' });
      await expect(service.checkIn('society', 'gate', 'credential', 'guard', condition === 'key' ? ' ' : 'key')).rejects.toThrow();
      expect(root.withTenantContext).toHaveBeenCalledTimes(1);
      expect(tx.accessRequest.updateMany).not.toHaveBeenCalled();
    }
  });

  it('fails closed without society context for host and gate operations', async () => {
    const { service, tx } = fixture();
    await expect(service.listMine('', 'resident')).rejects.toThrow('Missing tenant context');
    await expect(service.checkOut('', 'gate', 'credential', 'guard', 'key')).rejects.toThrow('Missing tenant context');
    expect(tx.accessRequest.updateMany).not.toHaveBeenCalled();
  });
});
