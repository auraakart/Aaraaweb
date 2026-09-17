import { describe, expect, it, vi } from 'vitest';
import { GuardOperationsService } from './guard-operations.service';

function sqlText(call: unknown) {
  const sql = call as { strings?: readonly string[]; values?: readonly unknown[] };
  return { text: sql.strings?.join(' ') ?? '', values: sql.values ?? [] };
}

describe('GuardOperationsService supervisor audit attribution', () => {
  it('records the supervisor who deactivates a watchlist entry', async () => {
    const prisma = { $executeRaw: vi.fn().mockResolvedValue(1) };
    const service = new GuardOperationsService(prisma as never);
    const actor = '22222222-2222-4222-8222-222222222222';

    await expect(service.deactivateWatchlist(
      '11111111-1111-4111-8111-111111111111',
      actor,
      '33333333-3333-4333-8333-333333333333',
    )).resolves.toEqual({ id: '33333333-3333-4333-8333-333333333333', active: false });

    const sql = sqlText(prisma.$executeRaw.mock.calls[0][0]);
    expect(sql.text).toContain('"deactivatedByUserId"');
    expect(sql.text).toContain('"deactivatedAt"=CURRENT_TIMESTAMP');
    expect(sql.values).toContain(actor);
  });

  it('records the supervisor who cancels a material gate pass', async () => {
    const prisma = { $executeRaw: vi.fn().mockResolvedValue(1) };
    const service = new GuardOperationsService(prisma as never);
    const actor = '55555555-5555-4555-8555-555555555555';

    await expect(service.cancelPass(
      '11111111-1111-4111-8111-111111111111',
      actor,
      '66666666-6666-4666-8666-666666666666',
    )).resolves.toEqual({ id: '66666666-6666-4666-8666-666666666666', status: 'CANCELLED' });

    const sql = sqlText(prisma.$executeRaw.mock.calls[0][0]);
    expect(sql.text).toContain('"cancelledByUserId"');
    expect(sql.text).toContain('"cancelledAt"=CURRENT_TIMESTAMP');
    expect(sql.values).toContain(actor);
  });
});
