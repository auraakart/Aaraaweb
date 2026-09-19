import { describe, expect, it, vi } from 'vitest';
import { PrivacyService } from './privacy.service';

describe('PrivacyService operator context', () => {
  it('returns tenant-scoped subjects and active assignees', async () => {
    const prisma={$queryRaw:vi.fn()
      .mockResolvedValueOnce([{id:'u1',name:'Resident One',phone:'+919000000001',relationship:'OWNER'}])
      .mockResolvedValueOnce([{id:'u2',name:'Privacy Admin',phone:'+919000000002'}])};
    const service=new PrivacyService(prisma as never);

    await expect(service.operatorContext('society-1')).resolves.toEqual({
      subjects:[{id:'u1',name:'Resident One',phone:'+919000000001',relationship:'OWNER'}],
      assignees:[{id:'u2',name:'Privacy Admin',phone:'+919000000002'}],
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
