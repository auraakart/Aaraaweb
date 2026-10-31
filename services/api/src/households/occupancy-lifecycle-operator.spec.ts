import { BadRequestException } from '@nestjs/common';
import { UnitRelation } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { OccupancyLifecycleService } from './occupancy-lifecycle.service';

describe('OccupancyLifecycleService operator workflow', () => {
  it('returns only tenant-scoped units and active occupancies in operator context', async () => {
    const prisma = {
      unit: { findMany: vi.fn().mockResolvedValue([]) },
      unitOccupancy: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new OccupancyLifecycleService({ ...prisma, withTenantContext: vi.fn(async (_scope, run) => run(prisma)) } as never);
    await expect(service.operatorContext('society-1')).resolves.toEqual({ units: [], occupancies: [] });
    expect(prisma.unit.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { societyId: 'society-1', building: { societyId: 'society-1' } },
    }));
    expect(prisma.unitOccupancy.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ societyId: 'society-1', active: true }),
    }));
  });

  it('rejects operator move-in when the mobile number is not registered', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } };
    const service = new OccupancyLifecycleService({ ...prisma, withTenantContext: vi.fn(async (_scope, run) => run(prisma)) } as never);
    await expect(service.requestMoveInByPhone('society-1','actor-1',{
      unitId:'11111111-1111-1111-1111-111111111111',
      tenantPhone:'+91 90000 00000',
      relation:UnitRelation.TENANT,
      effectiveAt:new Date('2026-09-20T00:00:00.000Z'),
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where:{phone:'+919000000000'},
      select:{id:true},
    });
  });

  it('resolves a registered mobile number into the existing lifecycle request path', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({id:'user-1'}) },
      unit: { findFirst: vi.fn().mockResolvedValue({id:'unit-1'}) },
      unitOccupancy: { findFirst: vi.fn().mockResolvedValue(null) },
      $queryRaw: vi.fn().mockResolvedValue([{id:'request-1'}]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const scoped=vi.fn(async (_scope,run)=>run(prisma));
    const service = new OccupancyLifecycleService({withTenantContext:scoped} as never);
    const effectiveAt=new Date('2026-09-20T00:00:00.000Z');
    await expect(service.requestMoveInByPhone('society-1','actor-1',{
      unitId:'11111111-1111-1111-1111-111111111111',tenantPhone:'+91-90000-00000',relation:UnitRelation.OWNER,effectiveAt,reason:'Scheduled handover',
    })).resolves.toEqual({id:'request-1'});
    expect(scoped).toHaveBeenCalledOnce();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({where:{phone:'+919000000000'},select:{id:true}});
    expect(prisma.$queryRaw.mock.calls[0][0].values).toEqual(expect.arrayContaining(['user-1',UnitRelation.OWNER,effectiveAt,'Scheduled handover','actor-1']));

  });
});
