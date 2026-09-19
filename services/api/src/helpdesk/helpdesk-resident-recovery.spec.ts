import { describe, expect, it, vi } from 'vitest';
import { HelpdeskService } from './helpdesk.service';

function sqlText(call: unknown): string {
  return ((call as { strings?: readonly string[] }).strings ?? []).join('?');
}

describe('HelpdeskService resident recovery context', () => {
  it('preserves self-only occupancy scope while enriching property and computed SLA context', async () => {
    const queryRaw=vi.fn().mockResolvedValue([{
      id:'ticket-1',unitId:'unit-1',buildingName:'A Block',unitNumber:'101',
      status:'IN_PROGRESS',computedSlaState:'ON_TRACK',
    }]);
    const service=new HelpdeskService({$queryRaw:queryRaw} as never);

    const rows=await service.listMine('society-1','user-1');
    expect(rows).toHaveLength(1);

    const text=sqlText(queryRaw.mock.calls[0]?.[0]);
    expect(text).toContain('JOIN "Unit"');
    expect(text).toContain('JOIN "Building"');
    expect(text).toContain('"unitNumber"');
    expect(text).toContain('"buildingName"');
    expect(text).toContain('"computedSlaState"');
    expect(text).toContain('FROM "UnitOccupancy" uo');
    expect(text).toContain('uo."userId" =');
    expect(text).toContain('uo."active" = true');
  });
});
