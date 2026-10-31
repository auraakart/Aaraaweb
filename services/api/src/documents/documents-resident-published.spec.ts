import { describe, expect, it, vi } from 'vitest';
import { DocumentsService } from './documents.service';
function scoped(prisma: unknown) {
  const p=prisma as { $transaction?: (run: (tx: unknown) => Promise<unknown>) => Promise<unknown> };
  return { withTenantContext: vi.fn(async (_scope: string, run: (tx: unknown) => Promise<unknown>) => p.$transaction ? p.$transaction(run) : run(prisma)) } as never;
}


function sqlText(call: unknown): string {
  return ((call as { strings?: readonly string[] }).strings ?? []).join('?');
}

describe('DocumentsService resident published repository', () => {
  it('keeps audience authorization while enriching published documents with property labels', async () => {
    const queryRaw=vi.fn()
      .mockResolvedValueOnce([{id:'doc-1',title:'Parking policy',status:'PUBLISHED',unitNumber:'101',buildingName:'A Block'}]);
    const service=new DocumentsService(scoped({$queryRaw:queryRaw}));
    const result=await service.listPublishedForUser('society-1','user-1');

    expect(result).toHaveLength(1);
    const text=sqlText(queryRaw.mock.calls[0]?.[0]);
    expect(text).toContain('LEFT JOIN "Unit"');
    expect(text).toContain('LEFT JOIN "Building"');
    expect(text).toContain('"unitNumber"');
    expect(text).toContain('"buildingName"');
    expect(text).toContain('d."audience" = \'ALL_MEMBERS\'');
    expect(text).toContain('d."audience" = \'OWNERS_ONLY\'');
    expect(text).toContain('d."audience" = \'PROPERTY_OWNER_ONLY\'');
    expect(text).toContain('d."status" = \'PUBLISHED\'');
  });
});
