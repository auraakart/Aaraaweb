import { describe, expect, it, vi } from 'vitest';
import { FacilitiesController } from './facilities.controller';

describe('FacilitiesController operator context', () => {
  it('returns tenant-scoped active society assignees through the facilities boundary', async () => {
    const prisma={$queryRaw:vi.fn().mockResolvedValue([
      {id:'user-1',name:'Facility One',phone:'+919000000001'},
      {id:'user-2',name:'Facility Two',phone:'+919000000002'},
    ])};
    const controller=new FacilitiesController(prisma as never);

    await expect(controller.operatorContext('society-1')).resolves.toEqual([
      {id:'user-1',name:'Facility One',phone:'+919000000001'},
      {id:'user-2',name:'Facility Two',phone:'+919000000002'},
    ]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
