import { describe, expect, it, vi } from 'vitest';
import { GateRecipientService } from './gate-recipient.service';

describe('GateRecipientService', () => {
  it('selects only active, time-valid occupants configured for gate notifications via the tenant client', async () => {
    const findMany = vi.fn().mockResolvedValue([{ userId: 'tenant-1', gateApprovalEnabled: true }]);
    const rootFindMany = vi.fn(() => { throw new Error('root client must not read gate recipients'); });
    const tx = { unitOccupancy: { findMany } };
    const withTenantContext = vi.fn(async (_id: string, action: (client: typeof tx) => Promise<unknown>) => action(tx));
    const service = new GateRecipientService({
      unitOccupancy: { findMany: rootFindMany }, withTenantContext,
    } as never);
    const now = new Date('2026-09-02T10:00:00.000Z');

    await expect(service.notificationRecipients('society-1', 'unit-1', now)).resolves.toEqual([
      { userId: 'tenant-1', gateApprovalEnabled: true },
    ]);
    expect(withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    expect(findMany).toHaveBeenCalledWith({
      where: {
        societyId: 'society-1', unitId: 'unit-1', active: true, gateNotificationEnabled: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      orderBy: [{ primaryGateContact: 'desc' }, { escalationOrder: 'asc' }, { createdAt: 'asc' }],
      select: { userId: true, gateApprovalEnabled: true },
    });
    expect(rootFindMany).not.toHaveBeenCalled();
  });

  it('returns no recipient when all occupancies have ended', async () => {
    const tx = { unitOccupancy: { findMany: vi.fn().mockResolvedValue([]) } };
    const withTenantContext = vi.fn(async (_id: string, action: (client: typeof tx) => Promise<unknown>) => action(tx));
    const rootFindMany = vi.fn(() => { throw new Error('root lookup forbidden'); });
    const service = new GateRecipientService({
      unitOccupancy: { findMany: rootFindMany }, withTenantContext,
    } as never);

    await expect(service.notificationRecipients('society-1', 'unit-1')).resolves.toEqual([]);
    expect(withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    expect(rootFindMany).not.toHaveBeenCalled();
  });

  it('switches society context without leaking the previous society’s gate recipients', async () => {
    const findMany = vi.fn(async ({ where }: { where: { societyId: string; unitId: string } }) =>
      where.societyId === 'society-a' && where.unitId === 'unit-a'
        ? [{ userId: 'occupant-a', gateApprovalEnabled: true }]
        : [],
    );
    const tx = { unitOccupancy: { findMany } };
    const withTenantContext = vi.fn(async (_id: string, action: (client: typeof tx) => Promise<unknown>) => action(tx));
    const rootFindMany = vi.fn(() => { throw new Error('root client forbidden'); });
    const service = new GateRecipientService({
      unitOccupancy: { findMany: rootFindMany }, withTenantContext,
    } as never);

    await expect(service.notificationRecipients('society-a', 'unit-a')).resolves.toEqual([
      { userId: 'occupant-a', gateApprovalEnabled: true },
    ]);
    await expect(service.notificationRecipients('society-b', 'unit-a')).resolves.toEqual([]);
    expect(withTenantContext.mock.calls.map(([id]) => id)).toEqual(['society-a', 'society-b']);
    expect(findMany.mock.calls.map(([query]) => query.where.societyId)).toEqual(['society-a', 'society-b']);
    expect(rootFindMany).not.toHaveBeenCalled();
  });

  it('fails closed when the tenant transaction cannot be established', async () => {
    const rootFindMany = vi.fn(() => { throw new Error('root client forbidden'); });
    const withTenantContext = vi.fn().mockRejectedValue(new Error('tenant context unavailable'));
    const service = new GateRecipientService({
      unitOccupancy: { findMany: rootFindMany }, withTenantContext,
    } as never);

    await expect(service.notificationRecipients('society-a', 'unit-a')).rejects.toThrow('tenant context unavailable');
    expect(rootFindMany).not.toHaveBeenCalled();
  });
});
