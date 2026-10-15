import { describe, expect, it, vi } from 'vitest';
import { GateRecipientService } from './gate-recipient.service';

describe('GateRecipientService', () => {
  it('selects only active, time-valid occupants configured for gate notifications', async () => {
    const prisma = { unitOccupancy: { findMany: vi.fn().mockResolvedValue([{ userId: 'tenant-1', gateApprovalEnabled: true }]) } };
    const service = new GateRecipientService(prisma as unknown as ConstructorParameters<typeof GateRecipientService>[0]);
    const now = new Date('2026-09-02T10:00:00.000Z');

    await expect(service.notificationRecipients('society-1', 'unit-1', now)).resolves.toEqual([
      { userId: 'tenant-1', gateApprovalEnabled: true },
    ]);
    expect(prisma.unitOccupancy.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        societyId: 'society-1', unitId: 'unit-1', active: true, gateNotificationEnabled: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      }),
      orderBy: [{ primaryGateContact: 'desc' }, { escalationOrder: 'asc' }, { createdAt: 'asc' }],
    }));
  });

  it('returns no recipient when all occupancies have ended', async () => {
    const prisma = { unitOccupancy: { findMany: vi.fn().mockResolvedValue([]) } };
    const service = new GateRecipientService(prisma as unknown as ConstructorParameters<typeof GateRecipientService>[0]);

    await expect(service.notificationRecipients('society-1', 'unit-1')).resolves.toEqual([]);
  });
});
