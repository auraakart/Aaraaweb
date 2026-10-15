import { describe, expect, it, vi } from 'vitest';
import { DocumentsService } from './documents.service';

describe('DocumentsService management context', () => {
  it('returns only tenant-scoped unit/building options for document targeting', async () => {
    const prisma={
      unit:{findMany:vi.fn().mockResolvedValue([
        {id:'unit-1',number:'101',building:{id:'b-1',name:'A Block',code:'A'}},
      ])},
    };
    const service=new DocumentsService(prisma as never);
    await expect(service.managementContext('society-1')).resolves.toEqual([
      {id:'unit-1',number:'101',building:{id:'b-1',name:'A Block',code:'A'}},
    ]);
    expect(prisma.unit.findMany).toHaveBeenCalledWith({
      where:{societyId:'society-1'},
      select:{id:true,number:true,building:{select:{id:true,name:true,code:true}}},
      orderBy:[{buildingId:'asc'},{number:'asc'}],
    });
  });
});
