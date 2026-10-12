import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaMembershipRepository } from '../auth/prisma-membership.repository';
import { EntitlementService } from '../entitlements/entitlement.service';
import { AppRole } from '../auth/auth.types';
import { societyBrandDigest } from './branding-contract';
import { BrandingService } from './branding.service';

const societyId='11111111-1111-4111-8111-111111111111';
const revisionId='22222222-2222-4222-8222-222222222222';
const principal={userId:'33333333-3333-4333-8333-333333333333',societyId,roles:[AppRole.SOCIETY_ADMIN]};
const cfg={displayName:'Palm Residences',colors:{primary:'#155E75',primaryDeep:'#164E63'}};
const mockRevision={id:revisionId,societyId,version:1,config:cfg,digest:societyBrandDigest(cfg),publishedAt:null};

function fixture(rows:unknown[]=[],found:unknown[]=[]) {
  const tx={
    $queryRaw:vi.fn(),
    societyBrandRevision:{
      findFirst:vi.fn(),create:vi.fn(),update:vi.fn(),findMany:vi.fn().mockResolvedValue([]),
    },
  };
  for(const item of rows)tx.$queryRaw.mockResolvedValueOnce(item);
  for(const item of found)tx.societyBrandRevision.findFirst.mockResolvedValueOnce(item);
  const prisma={
    $queryRaw:vi.fn(),$transaction:vi.fn(),
    withTenantContext:vi.fn(async (_id:string,fn:(client:typeof tx)=>Promise<unknown>)=>fn(tx)),
  };
  return {tx,prisma,service:new BrandingService(prisma as unknown as PrismaService,
    {} as EntitlementService,{} as PrismaMembershipRepository)};
}
const authorized=[[{id:societyId}],[{role:'SOCIETY_ADMIN'}]];
const draftInput={config:cfg,expectedLatestVersion:null,expectedPublishedVersion:null};

describe('V5.3.2 society brand publication, authorization and conflicts',()=>{
  it('rejects unknown selectors, unsafe versions and unvalidated presentation before a write',async()=>{
    const {service,prisma}=fixture();
    await expect(service.createDraft(principal,{...draftInput,partnerId:'other'}))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createDraft(principal,{...draftInput,expectedLatestVersion:0}))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createDraft(principal,{...draftInput,config:{featureFlags:{AI_ASSISTANT:true}}}))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });

  it('denies current society when admin membership was revoked in DB',async()=>{
    const {service,tx}=fixture([[{id:societyId}],[]]);
    await expect(service.createDraft(principal,draftInput)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.societyBrandRevision.create).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('requires an operational selected society even with stale principal roles',async()=>{
    const {service,prisma}=fixture();
    await expect(service.createDraft({userId:principal.userId,roles:[AppRole.SUPER_ADMIN]},draftInput))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });

  it('allocates version one under society row and live membership locks',async()=>{
    const {service,tx,prisma}=fixture(authorized,[null,null]);
    const row={...mockRevision};
    tx.societyBrandRevision.create.mockResolvedValue(row);
    await expect(service.createDraft(principal,draftInput)).resolves.toMatchObject(row);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    const locks=tx.$queryRaw.mock.calls.map(([sql])=>(sql as {strings:readonly string[]}).strings.join(' '));
    expect(locks[0]).toContain('FOR UPDATE');
    expect(locks[1]).toContain('FOR SHARE');
    expect(locks[1]).toContain('"SocietyMembership"');
    expect(tx.societyBrandRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      data:expect.objectContaining({societyId,version:1,createdById:principal.userId,
        config:cfg,digest:societyBrandDigest(cfg)}),
    }));
    expect(prisma.withTenantContext).toHaveBeenCalledWith(societyId,expect.any(Function));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('does not create a duplicate draft from a stale latest-version precondition',async()=>{
    const {service,tx}=fixture(authorized,[{version:2,id:'latest'},{version:1,id:'published'}]);
    await expect(service.createDraft(principal,draftInput)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.societyBrandRevision.create).not.toHaveBeenCalled();
  });

  it('publishes latest intact draft with expected published revision and preserves historical record',async()=>{
    const {service,tx}=fixture(authorized,[mockRevision,{version:1,id:revisionId},null]);
    tx.societyBrandRevision.update.mockResolvedValue({...mockRevision,publishedAt:new Date()});
    await expect(service.publishDraft(principal,{revisionId,expectedPublishedVersion:null}))
      .resolves.toHaveProperty('version',1);
    expect(tx.societyBrandRevision.update).toHaveBeenCalledWith({
      where:{id:revisionId,societyId},data:{publishedAt:expect.any(Date)},
    });
  });

  it('treats successful repeated publication of current revision as idempotent',async()=>{
    const target={...mockRevision,publishedAt:new Date()};
    const {service,tx}=fixture(authorized,[target,{version:1,id:revisionId},{version:1,id:revisionId}]);
    await expect(service.publishDraft(principal,{revisionId,expectedPublishedVersion:null}))
      .resolves.toEqual(target);
    expect(tx.societyBrandRevision.update).not.toHaveBeenCalled();
  });

  it('rejects a foreign revision before reading other society versions',async()=>{
    const {service,tx}=fixture(authorized,[null]);
    await expect(service.publishDraft(principal,{revisionId,expectedPublishedVersion:null}))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(tx.societyBrandRevision.update).not.toHaveBeenCalled();
  });

  it('rolls back a published version by appending a new immutable publication',async()=>{
    const source={...mockRevision,publishedAt:new Date()};
    const {service,tx}=fixture(authorized,[{version:3,id:'latest'},{version:3,id:'published'},source]);
    tx.societyBrandRevision.create.mockResolvedValue({...source,version:4});
    await expect(service.restorePublished(principal,{sourceVersion:1,
      expectedPublishedVersion:3,expectedLatestVersion:3}))
      .resolves.toHaveProperty('version',4);
    expect(tx.societyBrandRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      data:expect.objectContaining({societyId,version:4,publishedAt:expect.any(Date),
        config:cfg,digest:societyBrandDigest(cfg)}),
    }));
  });

  it('returns only selected society revision history for authenticated editor',async()=>{
    const {service,tx}=fixture(authorized,[{version:2,id:'latest'},{version:1,id:'pub'}]);
    tx.societyBrandRevision.findMany.mockResolvedValue([{...mockRevision}]);
    await expect(service.listRevisions(principal)).resolves.toMatchObject({
      societyId,latestVersion:2,publishedVersion:1,revisions:[{version:1}],
    });
    expect(tx.societyBrandRevision.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where:{societyId},orderBy:{version:'desc'},take:30,
    }));
  });
});
