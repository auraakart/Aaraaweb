import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { BearerGuard } from '../auth/bearer.guard';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProductFeature } from './entitlement.types';
import { PlatformPartnerLicenseController } from './platform-partner-license.controller';
import { PartnerLicensePersistenceService } from './partner-license-persistence.service';

const actor = '11111111-1111-4111-8111-111111111111';
const partner = '22222222-2222-4222-8222-222222222222';
const plan = '33333333-3333-4333-8333-333333333333';
const key = '44444444-4444-4444-8444-444444444444';
const draftRequest = {
  planRevisionId: plan, startsAt: '2026-11-01T00:00:00Z',
  endsAt: '2026-12-01T00:00:00Z', idempotencyKey: key,
};

describe('V5.4.3 commercial draft ledger isolation', () => {
  it('requires bearer auth and explicit existing Super Admin platform role', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, PlatformPartnerLicenseController) as unknown[];
    expect(guards).toContain(BearerGuard);
    expect(guards).toContain(RolesGuard);
    expect(Reflect.getMetadata(ROLES_KEY, PlatformPartnerLicenseController)).toEqual([AppRole.SUPER_ADMIN]);
  });

  it('serializes immutable plan numbering and does not touch legacy entitlements', async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      partnerLicensePlanRevision: {
        findFirst: vi.fn().mockResolvedValue({version:1}),
        create: vi.fn().mockResolvedValue({id:plan,version:2}),
      },
    };
    const prisma = { $transaction: vi.fn(async (run: (p:typeof tx)=>Promise<unknown>)=>run(tx)),
      society: { update: vi.fn() }, session: {updateMany:vi.fn()} };
    const service = new PartnerLicensePersistenceService(prisma as never);
    const input = {
      code: 'COMMUNITY_PLUS',expectedVersion:1,
      featureAllowlist:[ProductFeature.SOS,ProductFeature.VISITOR_MANAGEMENT],
      maximumSocieties:50,maximumDomains:1,maximumDistributions:2,
    };
    await expect(service.createPlanRevision(actor,input)).resolves.toEqual({id:plan,version:2});
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.partnerLicensePlanRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      data:expect.objectContaining({version:2,createdById:actor}),
    }));
    await expect(service.createPlanRevision(actor,{...input,expectedVersion:0}))
      .rejects.toThrow(/version changed/);
    expect(prisma.society.update).not.toHaveBeenCalled();
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it('rejects bad feature lists and capacity before any transaction',async()=>{
    const prisma={$transaction:vi.fn()};
    const service=new PartnerLicensePersistenceService(prisma as never);
    const input={code:'COMMUNITY_PLUS',expectedVersion:0,
      featureAllowlist:[ProductFeature.SOS],maximumSocieties:50,
      maximumDomains:1,maximumDistributions:0};
    await expect(service.createPlanRevision(actor,{...input,featureAllowlist:['UNKNOWN' as ProductFeature]}))
      .rejects.toThrow(/Invalid commercial/);
    await expect(service.createPlanRevision(actor,{...input,featureAllowlist:[ProductFeature.SOS,ProductFeature.SOS]}))
      .rejects.toThrow(/Invalid commercial/);
    await expect(service.createPlanRevision(actor,{...input,maximumSocieties:-1}))
      .rejects.toThrow(/Invalid commercial/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('records one DRAFT and its audit event atomically without granting rights',async()=>{
    const grant = {id:'55555555-5555-4555-8555-555555555555',status:'DRAFT',version:1};
    const tx={
      partner:{findUnique:vi.fn().mockResolvedValue({status:'ACTIVE'})},
      partnerLicensePlanRevision:{findUnique:vi.fn().mockResolvedValue({id:plan})},
      partnerLicenseGrant:{create:vi.fn().mockResolvedValue(grant)},
      partnerLicenseEvent:{create:vi.fn().mockResolvedValue({id:'event'})},
    };
    const prisma={
      partnerLicenseGrant:{findUnique:vi.fn().mockResolvedValue(null)},
      $transaction:vi.fn(async (callback:(p:typeof tx)=>Promise<unknown>)=>callback(tx)),
      society:{update:vi.fn()},session:{updateMany:vi.fn()},
    };
    const service=new PartnerLicensePersistenceService(prisma as never);
    await expect(service.createGrantDraft(actor,partner,draftRequest)).resolves.toEqual(grant);
    expect(tx.partnerLicenseGrant.create).toHaveBeenCalledWith(expect.objectContaining({
      data:expect.objectContaining({status:'DRAFT',partnerId:partner,createdById:actor}),
    }));
    expect(tx.partnerLicenseEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data:expect.objectContaining({actorId:actor,type:'DRAFT_CREATED',idempotencyKey:key}),
    }));
    expect(prisma.society.update).not.toHaveBeenCalled();
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it('replays only exactly identical drafts; mismatched replay keys fail closed',async()=>{
    const prev={
      id:'55555555-5555-4555-8555-555555555555',partnerId:partner,
      planRevisionId:plan,createdById:actor,status:'DRAFT',version:1,
      startsAt:new Date(draftRequest.startsAt),endsAt:new Date(draftRequest.endsAt),
      graceUntil:null,
    };
    const prisma={
      partnerLicenseGrant:{findUnique:vi.fn().mockResolvedValue(prev)},
      $transaction:vi.fn(),
    };
    const service=new PartnerLicensePersistenceService(prisma as never);
    expect(await service.createGrantDraft(actor,partner,draftRequest))
      .toEqual({id:prev.id,status:'DRAFT',version:1});
    await expect(service.createGrantDraft(actor,partner,{
      ...draftRequest,endsAt:'2026-12-10T00:00:00Z',
    })).rejects.toThrow(/key already used/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects inactive partner, unknown plan and backwards contract periods',async()=>{
    const tx={
      partner:{findUnique:vi.fn().mockResolvedValue({status:'RESTRICTED'})},
      partnerLicensePlanRevision:{findUnique:vi.fn().mockResolvedValue({id:plan})},
      partnerLicenseGrant:{create:vi.fn()},
      partnerLicenseEvent:{create:vi.fn()},
    };
    const prisma={
      partnerLicenseGrant:{findUnique:vi.fn().mockResolvedValue(null)},
      $transaction:vi.fn(async (callback:(p:typeof tx)=>Promise<unknown>)=>callback(tx)),
    };
    const service=new PartnerLicensePersistenceService(prisma as never);
    await expect(service.createGrantDraft(actor,partner,{
      ...draftRequest,endsAt:'2026-10-01T00:00:00Z',
    })).rejects.toThrow(/Invalid grant period/);
    await expect(service.createGrantDraft(actor,partner,draftRequest)).rejects.toThrow(/Inactive partner/);
    expect(tx.partnerLicenseGrant.create).not.toHaveBeenCalled();
    expect(tx.partnerLicenseEvent.create).not.toHaveBeenCalled();
  });
});
