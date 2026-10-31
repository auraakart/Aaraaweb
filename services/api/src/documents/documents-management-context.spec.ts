import { describe, expect, it, vi } from 'vitest';
import { DocumentsService } from './documents.service';
function scoped(prisma: unknown) {
  const p=prisma as { $transaction?: (run: (tx: unknown) => Promise<unknown>) => Promise<unknown> };
  return { withTenantContext: vi.fn(async (_scope: string, run: (tx: unknown) => Promise<unknown>) => p.$transaction ? p.$transaction(run) : run(prisma)) } as never;
}


describe('DocumentsService management context', () => {
  it('returns only tenant-scoped unit/building options for document targeting', async () => {
    const prisma={
      unit:{findMany:vi.fn().mockResolvedValue([
        {id:'unit-1',number:'101',building:{id:'b-1',name:'A Block',code:'A'}},
      ])},
    };
    const service=new DocumentsService(scoped(prisma));
    await expect(service.managementContext('society-1')).resolves.toEqual([
      {id:'unit-1',number:'101',building:{id:'b-1',name:'A Block',code:'A'}},
    ]);
    expect(prisma.unit.findMany).toHaveBeenCalledWith({
      where:{societyId:'society-1',building:{societyId:'society-1'}},
      select:{id:true,number:true,building:{select:{id:true,name:true,code:true}}},
      orderBy:[{buildingId:'asc'},{number:'asc'}],
    });
  });
});
