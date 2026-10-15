import { describe, expect, it, vi } from 'vitest';
import { UtilityResidentService } from './utility-resident.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';

describe('UtilityResidentService', () => {
  it('lists only issued utility charges linked to invoices and authorized unit relationships', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new UtilityResidentService(prisma as never);

    await service.listIssuedCharges(societyId, userId);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const query = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[] };
    const sql = query.strings.join(' ');
    expect(sql).toContain('"sourceUtilityChargeDraftId"');
    expect(sql).toContain('d."status"=\'ISSUED\'');
    expect(sql).toContain('"UnitOwnership"');
    expect(sql).toContain('uo."verified"=true');
    expect(sql).toContain('"UnitOccupancy"');
    expect(sql).toContain("ur.\"relation\"='TENANT'");
    expect(sql).toContain('"calculationJson"');
    expect(sql).toContain('"openingReadingValue"');
    expect(sql).toContain('"closingReadingValue"');
  });
});
