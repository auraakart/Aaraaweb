import { describe, expect, it, vi } from 'vitest';
import { PrivacyService } from './privacy.service';

describe('PrivacyService operator context', () => {
  it('returns tenant-scoped subjects and active assignees', async () => {
    const tx={$queryRaw:vi.fn()
      .mockResolvedValueOnce([{id:'u1',name:'Resident One',phone:'+919000000001',relationship:'OWNER'}])
      .mockResolvedValueOnce([{id:'u2',name:'Privacy Admin',phone:'+919000000002'}])};
    const prisma={ $queryRaw:vi.fn(), withTenantContext:vi.fn(async (_id:string,operation:(client:typeof tx)=>Promise<unknown>)=>operation(tx)) };
    const service=new PrivacyService(prisma as never);

    await expect(service.operatorContext('society-1')).resolves.toEqual({
      subjects:[{id:'u1',name:'Resident One',phone:'+919000000001',relationship:'OWNER'}],
      assignees:[{id:'u2',name:'Privacy Admin',phone:'+919000000002'}],
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1',expect.any(Function));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    for(const [query] of tx.$queryRaw.mock.calls) expect((query as {values:unknown[]}).values).toContain('society-1');
  });
});
