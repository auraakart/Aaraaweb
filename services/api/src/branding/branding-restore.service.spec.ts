import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { PrismaMembershipRepository } from '../auth/prisma-membership.repository';
import { EntitlementService } from '../entitlements/entitlement.service';
import { PrismaService } from '../prisma/prisma.service';
import { BrandingService } from './branding.service';
import { societyBrandDigest } from './branding-contract';

const societyId='11111111-1111-4111-8111-111111111111';
const userId='22222222-2222-4222-8222-222222222222';
const sourceId='33333333-3333-4333-8333-333333333333';
const currentId='44444444-4444-4444-8444-444444444444';
const config={displayName:'Society North',colors:{primary:'#155E75',primaryDeep:'#164E63'}};
const versions={expectedVersion:3,expectedPublishedVersion:2};
function setup(role:AppRole|null=AppRole.SOCIETY_ADMIN){
  const tx={
    societyMembership:{findMany:vi.fn().mockResolvedValue(role?[{userId,societyId,role,active:true}]:[])},
    $queryRaw:vi.fn().mockResolvedValue([{id:societyId}]),
    society:{findFirst:vi.fn().mockResolvedValue({id:societyId})},
    societyBrandRevision:{
      findFirst:vi.fn().mockResolvedValueOnce({version:3})
        .mockResolvedValueOnce({id:currentId,version:2})
        .mockResolvedValueOnce({id:sourceId,version:1,config,digest:societyBrandDigest(config)}),
      create:vi.fn().mockResolvedValue({id:'revision-four',version:4}),
      updateMany:vi.fn().mockResolvedValue({count:1}),
    },
  };
  const prisma={withTenantContext:vi.fn(async (_id:string,fn:(client:typeof tx)=>Promise<unknown>)=>fn(tx)),
    $queryRaw:vi.fn(),societyBrandRevision:{create:vi.fn(),updateMany:vi.fn()}};
  const service=new BrandingService(prisma as unknown as PrismaService,
    {} as EntitlementService,new PrismaMembershipRepository(prisma as unknown as PrismaService));
  return {service,prisma,tx};
}
describe('V5.3.8 atomic society branding restore',()=>{
  it('creates a new published revision without altering the historical source',async()=>{
    const {service,prisma,tx}=setup();
    await expect(service.restorePublished(societyId,userId,sourceId,versions)).resolves.toEqual({
      id:'revision-four',version:4,revision:`society-${societyId}-v4`,
      restoredFromRevisionId:sourceId,published:true,
    });
    expect(tx.societyBrandRevision.create).toHaveBeenCalledWith({
      data:{societyId,createdById:userId,version:4,config,digest:societyBrandDigest(config)},
      select:{id:true,version:true},
    });
    expect(tx.societyBrandRevision.updateMany).toHaveBeenCalledWith({
      where:{id:'revision-four',societyId,publishedAt:null},data:{publishedAt:expect.any(Date)},
    });
    expect(prisma.withTenantContext).toHaveBeenCalledWith(societyId,expect.any(Function));
    expect(prisma.societyBrandRevision.create).not.toHaveBeenCalled();
  });
  it('rejects invalid optimistic version before opening tenant context',async()=>{
    const {service,prisma}=setup();
    await expect(service.restorePublished(societyId,userId,sourceId,{expectedVersion:0,expectedPublishedVersion:2}))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });
  it.each([null,AppRole.TENANT,AppRole.AUDITOR])('denies noneditor %s before reading history',async role=>{
    const {service,tx}=setup(role);
    await expect(service.restorePublished(societyId,userId,sourceId,versions))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.societyBrandRevision.findFirst).not.toHaveBeenCalled();
  });
  it('rejects stale expected versions before restoring',async()=>{
    const {service,tx}=setup();
    await expect(service.restorePublished(societyId,userId,sourceId,{expectedVersion:4,expectedPublishedVersion:2}))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.societyBrandRevision.findFirst).toHaveBeenCalledTimes(2);
    expect(tx.societyBrandRevision.create).not.toHaveBeenCalled();
  });
  it('rejects a foreign or unpublished source',async()=>{
    const {service,tx}=setup();
    tx.societyBrandRevision.findFirst.mockReset()
      .mockResolvedValueOnce({version:3}).mockResolvedValueOnce({id:currentId,version:2})
      .mockResolvedValueOnce(null);
    await expect(service.restorePublished(societyId,userId,sourceId,versions))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(tx.societyBrandRevision.findFirst).toHaveBeenLastCalledWith({
      where:{societyId,id:sourceId,publishedAt:{not:null}},
      select:{id:true,version:true,config:true,digest:true},
    });
    expect(tx.societyBrandRevision.create).not.toHaveBeenCalled();
  });
  it('rejects restoration of the current published revision',async()=>{
    const {service,tx}=setup();
    tx.societyBrandRevision.findFirst.mockReset()
      .mockResolvedValueOnce({version:3}).mockResolvedValueOnce({id:sourceId,version:2})
      .mockResolvedValueOnce({id:sourceId,version:2,config,digest:societyBrandDigest(config)});
    await expect(service.restorePublished(societyId,userId,sourceId,versions))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.societyBrandRevision.create).not.toHaveBeenCalled();
  });
  it('rejects malformed or tampered published configuration',async()=>{
    const {service,tx}=setup();
    tx.societyBrandRevision.findFirst.mockReset()
      .mockResolvedValueOnce({version:3}).mockResolvedValueOnce({id:currentId,version:2})
      .mockResolvedValueOnce({id:sourceId,version:1,config,digest:'0'.repeat(64)});
    await expect(service.restorePublished(societyId,userId,sourceId,versions))
      .rejects.toThrow('Source branding revision failed integrity verification');
    expect(tx.societyBrandRevision.create).not.toHaveBeenCalled();
  });
  it('fails closed if newly created revision cannot be published',async()=>{
    const {service,tx}=setup();
    tx.societyBrandRevision.updateMany.mockResolvedValueOnce({count:0});
    await expect(service.restorePublished(societyId,userId,sourceId,versions))
      .rejects.toThrow('Restored branding revision could not be published');
  });
});
