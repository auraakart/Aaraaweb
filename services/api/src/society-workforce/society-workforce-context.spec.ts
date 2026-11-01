import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { SocietyWorkforceService } from './society-workforce.service';

function fixture(verification = 'VERIFIED') {
  const worker = { id: 'worker-a', societyId: 'society-a', name: 'Staff', phone: '+919999999999', active: true, verification, schedule: {}, startDate: null, endDate: null, gateAccesses: [{ gateId: 'gate-a' }], attendances: [], leaves: [] };
  const attendance = { id: 'attendance-a', workerId: worker.id, societyId: worker.societyId, gateId: 'gate-a', checkedInAt: new Date('2026-11-01T01:00:00Z'), checkedOutAt: null };
  const tx = {
    societyWorker: { findFirst: vi.fn(async () => worker), findMany: vi.fn(async () => [worker]), create: vi.fn(async () => worker), update: vi.fn(async () => worker), findUniqueOrThrow: vi.fn(async () => worker) },
    gate: { count: vi.fn(async () => 1) },
    societyWorkerGateAccess: { createMany: vi.fn(), deleteMany: vi.fn() },
    societyWorkerLeave: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null as unknown), create: vi.fn(async () => ({ id: 'leave-a' })), update: vi.fn() },
    societyWorkerEvent: { findMany: vi.fn(async () => []), create: vi.fn() },
    societyWorkerAttendance: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null as unknown), create: vi.fn(async () => attendance), update: vi.fn(async () => attendance) },
    $queryRaw: vi.fn(async () => [{ id: worker.id }]),
  };
  const root = new Proxy({ withTenantContext: vi.fn(async (societyId, operation) => { expect(societyId).toBe('society-a'); return operation(tx); }) }, { get(target, key) { if (key in target) return Reflect.get(target, key); throw new Error(`Root client forbidden: ${String(key)}`); } });
  const service = new SocietyWorkforceService(root as unknown as PrismaService);
  return { service, root, tx, worker, attendance };
}

describe('Society workforce selected-client boundaries', () => {
  it.each(['list', 'attendance', 'leaves', 'operationsSummary'] as const)('%s reads only through selected client', async method => {
    const f = fixture(); await f.service[method]('society-a'); expect(f.root.withTenantContext).toHaveBeenCalledOnce();
  });
  it.each(['timeline', 'configure', 'verify', 'reject', 'suspend', 'reactivate'] as const)('%s checks and writes in one scope', async method => {
    const f = fixture(method === 'reactivate' ? 'SUSPENDED' : ['verify', 'reject'].includes(method) ? 'PENDING' : 'VERIFIED');
    if (method === 'timeline') await f.service.timeline('society-a', 'worker-a');
    else if (method === 'configure') await f.service.configure('society-a', 'worker-a', 'actor-a', { department: 'Security' });
    else await f.service[method]('society-a', 'worker-a', 'actor-a');
    expect(f.root.withTenantContext).toHaveBeenCalledOnce();
  });
  it('creates worker, validated gate links and event atomically', async () => {
    const f = fixture(); f.tx.societyWorker.findFirst.mockResolvedValue(null as never);
    await f.service.create('society-a', 'actor-a', { name: 'Staff', phone: '+919999999999', role: 'Gardener', department: 'Grounds', gateIds: ['gate-a'] });
    expect(f.tx.societyWorkerEvent.create).toHaveBeenCalledOnce(); expect(f.root.withTenantContext).toHaveBeenCalledOnce();
  });
  it('adds leave after worker locking and scoped overlap check', async () => {
    const f = fixture(); await f.service.addLeave('society-a', 'worker-a', 'actor-a', new Date('2026-11-02'), new Date('2026-11-03'));
    expect(f.tx.societyWorkerLeave.create).toHaveBeenCalledOnce();
  });
  it('rechecks cancellation after obtaining the worker lock', async () => {
    const f = fixture(); f.tx.societyWorkerLeave.findFirst.mockResolvedValue({ id: 'leave-a', workerId: 'worker-a', active: true });
    await f.service.cancelLeave('society-a', 'leave-a', 'actor-a'); expect(f.tx.societyWorkerLeave.findFirst).toHaveBeenCalledTimes(2);
  });
  it('corrects attendance and records its event through the selected client', async () => {
    const f = fixture(); f.tx.societyWorkerAttendance.findFirst.mockResolvedValue(f.attendance);
    await f.service.correctAttendance('society-a', 'attendance-a', 'actor-a', { checkedOutAt: new Date('2026-11-01T05:00:00Z'), reason: 'Reviewed correction' });
    expect(f.tx.societyWorkerEvent.create).toHaveBeenCalledOnce(); expect(f.root.withTenantContext).toHaveBeenCalledOnce();
  });
  it.each(['gateEligible', 'gateLookup'] as const)('%s scopes gate and nested parent reads', async method => {
    const f = fixture(); await f.service[method]('society-a', 'gate-a', 'Staff');
    expect(f.tx.gate.count).toHaveBeenCalledOnce(); expect(f.root.withTenantContext).toHaveBeenCalledOnce();
  });
  it('checks in after scoped eligibility and key/worker locks, without nested transactions', async () => {
    const f = fixture(); await f.service.checkIn('society-a', 'gate-a', 'worker-a', 'actor-a', 'check-in-0001');
    expect(f.tx.$queryRaw).toHaveBeenCalledTimes(2); expect(f.tx.societyWorkerAttendance.create).toHaveBeenCalledOnce(); expect(f.root.withTenantContext).toHaveBeenCalledOnce();
  });
  it('checks out conditionally and keeps original action identity on retry', async () => {
    const f = fixture(); f.tx.societyWorkerAttendance.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(f.attendance);
    await f.service.checkOut('society-a', 'gate-a', 'worker-a', 'actor-a', 'check-out-0001');
    expect(f.tx.societyWorkerAttendance.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'attendance-a', societyId: 'society-a', workerId: 'worker-a', checkedOutAt: null } }));
  });
  it('rejects a missing scoped worker before writing', async () => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValue([]);
    await expect(f.service.checkIn('society-a', 'gate-a', 'foreign-worker', 'actor-a', 'check-in-0001')).rejects.toThrow('Society worker not found');
    expect(f.tx.societyWorkerAttendance.create).not.toHaveBeenCalled();
  });
  it('rejects reopening when another attendance is already open', async () => {
    const f = fixture(); f.tx.societyWorkerAttendance.findFirst.mockResolvedValue(f.attendance);
    await expect(f.service.correctAttendance('society-a', 'attendance-a', 'actor-a', { checkedOutAt: null, reason: 'Reviewed correction' })).rejects.toThrow('already has an open');
    expect(f.tx.societyWorkerAttendance.update).not.toHaveBeenCalled();
  });
});
