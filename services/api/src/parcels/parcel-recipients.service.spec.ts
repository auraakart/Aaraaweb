import { describe, expect, it, vi } from 'vitest';
import { ParcelRecipientsService } from './parcel-recipients.service';

describe('ParcelRecipientsService', () => {
  it('returns only current occupants and avoids contact data', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const prisma = { withTenantContext: vi.fn((_society: string, cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new ParcelRecipientsService(prisma as never);
    await service.list('11111111-1111-4111-8111-111111111111');
    const query = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[] };
    const sql = query.strings.join(' ');
    expect(sql).toContain('FROM "UnitOccupancy"');
    expect(sql).toContain('uo."active"=true');
    expect(sql).toContain('uo."effectiveFrom"<=CURRENT_TIMESTAMP');
    expect(sql).toContain('uo."effectiveTo" IS NULL');
    expect(sql).toContain('resident."name"');
    expect(sql).not.toContain('resident."phone"');
    expect(sql).not.toContain('resident."email"');
    expect(prisma.withTenantContext).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', expect.any(Function));
  });
});
