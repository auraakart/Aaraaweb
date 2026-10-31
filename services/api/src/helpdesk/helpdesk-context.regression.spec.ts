import { describe, expect, it, vi } from 'vitest';
import { HelpdeskService } from './helpdesk.service';
import { HelpdeskSlaService } from './helpdesk-sla.service';
const society = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const ticket = '33333333-3333-4333-8333-333333333333';
const unit = '44444444-4444-4444-8444-444444444444';
function fixture() {
  const tx = { $queryRaw: vi.fn().mockResolvedValue([]), $executeRaw: vi.fn().mockResolvedValue(1),
    societyMembership: { findFirst: vi.fn().mockResolvedValue(null) } };
  const denied = vi.fn(async () => { throw new Error('Unscoped database access'); });
  const prisma = { $queryRaw: denied, $executeRaw: denied, $transaction: denied,
    societyMembership: { findFirst: denied },
    withTenantContext: vi.fn((_society: string, run: (client: typeof tx) => unknown) => run(tx)) };
  return { tx, denied, prisma, service: new HelpdeskService(prisma as never), sla: new HelpdeskSlaService(prisma as never) };
}
describe('Helpdesk transaction client boundaries', () => {
  const calls: Array<[string, (s: HelpdeskService) => Promise<unknown>]> = [
    ['resident list', s => s.listMine(society, actor)],
    ['asset resolution', s => s.resolveResidentAsset(society, actor, unit, 'LIFT-A')],
    ['create', s => s.createMine(society, actor, { unitId: unit, idempotencyKey: 'complaint-attempt', title: 'Water leak', description: 'Water leaking in kitchen' })],
    ['review list', s => s.listReview(society)], ['review members', s => s.reviewContext(society)],
    ['review assets', s => s.reviewAssets(society)], ['asset linkage', s => s.linkAsset(society, actor, ticket, null)],
    ['triage', s => s.triageIntelligence(society, ticket)],
    ['assignment preview', s => s.assignmentPreview(society, ticket, actor)],
    ['assign', s => s.assign(society, actor, ticket, actor)],
    ['resident history', s => s.activitiesMine(society, actor, ticket)],
    ['review history', s => s.activitiesReview(society, ticket)],
    ['resident comment', s => s.addComment(society, actor, ticket, 'Please update', false, 'comment-attempt')],
    ['review comment', s => s.addComment(society, actor, ticket, 'Please update', true)],
    ['internal note', s => s.addInternalNote(society, actor, ticket, 'Investigating')],
    ['status transition', s => s.updateStatus(society, actor, ticket, 'IN_PROGRESS')],
    ['resident reopen', s => s.reopenMine(society, actor, ticket, 'Leak returned')],
    ['operator reopen', s => s.reopen(society, actor, ticket, 'Leak returned')],
  ];
  it.each(calls)('uses only the selected client for %s', async (_label, call) => {
    const f = fixture(); await call(f.service).catch(() => undefined);
    expect(f.prisma.withTenantContext).toHaveBeenCalledExactlyOnceWith(society, expect.any(Function));
    expect(f.denied).not.toHaveBeenCalled();
  });
  it.each([
    ['policies', (s: HelpdeskSlaService) => s.listPolicies(society)],
    ['upsert policy', (s: HelpdeskSlaService) => s.upsertPolicy(society, actor, { priority: 'NORMAL', firstResponseMinutes: 5, resolutionMinutes: 30, escalationAfterMinutes: 10 })],
    ['queue', (s: HelpdeskSlaService) => s.listQueue(society)],
    ['readiness', (s: HelpdeskSlaService) => s.readiness(society, ticket)],
    ['apply policy', (s: HelpdeskSlaService) => s.applyPolicy(society, actor, ticket)],
    ['evaluate', (s: HelpdeskSlaService) => s.evaluate(society, actor, ticket)],
    ['escalate', (s: HelpdeskSlaService) => s.escalate(society, actor, ticket, actor)],
    ['history', (s: HelpdeskSlaService) => s.history(society, ticket)],
  ] as const)('scopes SLA %s', async (_label, call) => {
    const f = fixture(); await call(f.sla).catch(() => undefined);
    expect(f.prisma.withTenantContext).toHaveBeenCalledExactlyOnceWith(society, expect.any(Function));
    expect(f.denied).not.toHaveBeenCalled();
  });
  it('checks resident authority and reads history on the same client without internal notes', async () => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValueOnce([{ id: ticket }]).mockResolvedValueOnce([{ message: 'Public update' }]);
    await expect(f.service.activitiesMine(society, actor, ticket)).resolves.toEqual([{ message: 'Public update' }]);
    expect(f.prisma.withTenantContext).toHaveBeenCalledTimes(1);
    const [parent, history] = f.tx.$queryRaw.mock.calls.map(([q]) => q as { sql: string; values: unknown[] });
    expect(parent.sql).toContain('scope_building'); expect(parent.values).toContain(actor);
    expect(history.values).toContain(false); expect(f.denied).not.toHaveBeenCalled();
  });
  it('creates a ticket and its activity using the same client after current occupancy approval', async () => {
    const f = fixture();
    f.tx.$queryRaw.mockResolvedValueOnce([{id: unit}]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{id: ticket, societyId: society}]);
    await expect(f.service.createMine(society, actor, {unitId: unit, idempotencyKey: 'new-ticket-attempt', title: 'Water leak', description: 'Water leaking under sink'})).resolves.toMatchObject({id: ticket});
    expect(f.prisma.withTenantContext).toHaveBeenCalledTimes(1);
    expect(f.tx.$executeRaw).toHaveBeenCalledOnce();
    expect((f.tx.$executeRaw.mock.calls[0][0] as {sql: string}).sql).toContain("'CREATED'");
    expect(f.denied).not.toHaveBeenCalled();
  });
  it('links a valid asset and records its label once', async () => {
    const f = fixture();
    f.tx.$queryRaw.mockResolvedValueOnce([{id: ticket, status: 'OPEN', assetId: null}])
      .mockResolvedValueOnce([{id: unit, code: 'LIFT-A', name: 'Tower lift'}])
      .mockResolvedValueOnce([{id: ticket, assetId: unit}]);
    await expect(f.service.linkAsset(society, actor, ticket, unit)).resolves.toMatchObject({assetId: unit});
    expect((f.tx.$executeRaw.mock.calls[0][0] as {values: unknown[]}).values).toContain('LIFT-A · Tower lift');
    expect(f.denied).not.toHaveBeenCalled();
  });
  it('keeps assignment preview read-only and rejects a stale confirmation', async () => {
    const f = fixture(); const updatedAt = new Date('2026-10-31T10:00:00Z');
    f.tx.$queryRaw.mockResolvedValue([{id: ticket, status: 'OPEN', updatedAt, title: 'Water leak', assignedToId: null, buildingName: 'A', unitNumber: '101'}]);
    f.tx.societyMembership.findFirst.mockResolvedValue({id: actor, user: {name: 'Manager'}} as never);
    await expect(f.service.assignmentPreview(society, ticket, actor)).resolves.toMatchObject({confirmationRequired: true, mutationPerformed: false, targetAssigneeName: 'Manager'});
    await expect(f.service.assign(society, actor, ticket, actor, '2026-10-30T10:00:00Z')).rejects.toThrow('changed');
    expect(f.tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('resolves with a reason and atomic activity, and keeps internal notes on the same client', async () => {
    const f = fixture();
    f.tx.$queryRaw.mockResolvedValueOnce([{id: ticket, status: 'IN_PROGRESS'}]).mockResolvedValueOnce([{id: ticket, status: 'RESOLVED'}]);
    await expect(f.service.updateStatus(society, actor, ticket, 'RESOLVED', 'Replaced pipe', 'FIXED')).resolves.toMatchObject({status: 'RESOLVED'});
    expect(f.tx.$executeRaw).toHaveBeenCalledOnce();
    f.tx.$queryRaw.mockResolvedValueOnce([{id: ticket}]);
    await expect(f.service.addInternalNote(society, actor, ticket, 'Manager verified')).resolves.toEqual({ok: true});
    expect(f.tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(f.denied).not.toHaveBeenCalled();
  });

});
