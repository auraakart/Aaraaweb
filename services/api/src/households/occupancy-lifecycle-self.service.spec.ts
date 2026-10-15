import { UnitRelation } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { OccupancyLifecycleSelfService } from './occupancy-lifecycle-self.service';

describe('OccupancyLifecycleSelfService', () => {
  it('resolves an existing tenant account by normalized mobile number', async () => {
    const prisma={
      unitOwnership:{findFirst:vi.fn().mockResolvedValue({id:'owner-link'})},
      user:{findUnique:vi.fn().mockResolvedValue({id:'tenant-user'})},
    };
    const lifecycle={requestOwnerMoveIn:vi.fn().mockResolvedValue({id:'request-1'})};
    const service=new OccupancyLifecycleSelfService(prisma as never,lifecycle as never);
    await service.requestTenantMoveInByPhone('society','owner',{unitId:'unit',tenantPhone:'+91 98765 43210',effectiveAt:new Date('2026-10-01T00:00:00.000Z')});
    expect(prisma.user.findUnique).toHaveBeenCalledWith({where:{phone:'+919876543210'},select:{id:true}});
    expect(lifecycle.requestOwnerMoveIn).toHaveBeenCalledWith('society','owner',expect.objectContaining({unitId:'unit',userId:'tenant-user',relation:UnitRelation.TENANT}));
  });

  it('requires verified active ownership before account resolution', async () => {
    const prisma={unitOwnership:{findFirst:vi.fn().mockResolvedValue(null)},user:{findUnique:vi.fn()}};
    const lifecycle={requestOwnerMoveIn:vi.fn()};
    const service=new OccupancyLifecycleSelfService(prisma as never,lifecycle as never);
    await expect(service.requestTenantMoveInByPhone('society','owner',{unitId:'unit',tenantPhone:'9876543210',effectiveAt:new Date()})).rejects.toThrow('Verified active ownership');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(lifecycle.requestOwnerMoveIn).not.toHaveBeenCalled();
  });
});
