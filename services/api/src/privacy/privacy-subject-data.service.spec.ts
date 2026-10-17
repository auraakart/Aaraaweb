import { BadRequestException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { PrivacySubjectDataService } from './privacy-subject-data.service';

function serviceWith(queryResults:unknown[]){
  const tx={$queryRaw:vi.fn()};
  for(const result of queryResults)tx.$queryRaw.mockResolvedValueOnce(result);
  const prisma={
    $queryRaw:vi.fn(),
    $transaction:vi.fn(async (operation:(client:typeof tx)=>Promise<unknown>)=>operation(tx)),
    withTenantContext:vi.fn(async (_societyId:string,operation:(client:typeof tx)=>Promise<unknown>)=>operation(tx)),
  };
  return {tx,prisma,service:new PrivacySubjectDataService(prisma as never)};
}

describe('V4 privacy fulfilment closure',()=>{
  it('fails closed when an ACCESS export is requested before completion',async()=>{
    const {service,tx,prisma}=serviceWith([[
      {id:'11111111-1111-4111-8111-111111111111',societyId:'22222222-2222-4222-8222-222222222222',subjectUserId:'33333333-3333-4333-8333-333333333333',requestType:'ACCESS',status:'IN_REVIEW',legalHold:false,retentionDecision:null},
    ]]);
    await expect(service.exportMine(
      '33333333-3333-4333-8333-333333333333',
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('blocks erasure while an active society relationship exists even after retention approval',async()=>{
    const {service,prisma,tx}=serviceWith([
      [{id:'11111111-1111-4111-8111-111111111111',societyId:'22222222-2222-4222-8222-222222222222',subjectUserId:'33333333-3333-4333-8333-333333333333',requestType:'ERASURE',status:'IN_REVIEW',legalHold:false,retentionDecision:'ALLOW'}],
      [{count:1}],
    ]);
    const plan=await service.erasurePlan('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111');
    expect(plan.executable).toBe(false);
    expect(plan.blockers).toContain('ACTIVE_SOCIETY_RELATIONSHIP');
    expect(plan.retain).toContain('financial/accounting evidence');
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('blocks account-wide anonymisation while any active account relationship exists',async()=>{
    const {service,prisma}=serviceWith([
      [{id:'11111111-1111-4111-8111-111111111111',societyId:null,subjectUserId:'33333333-3333-4333-8333-333333333333',requestType:'ERASURE',status:'IN_REVIEW',legalHold:false,retentionDecision:'ALLOW'}],
      [{count:2}],
    ]);
    const plan=await service.erasurePlan(undefined,'11111111-1111-4111-8111-111111111111');
    expect(plan.executable).toBe(false);
    expect(plan.blockers).toContain('ACTIVE_ACCOUNT_RELATIONSHIP');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('requires explicit retention approval before erasure execution can become executable',async()=>{
    const {service}=serviceWith([
      [{id:'11111111-1111-4111-8111-111111111111',societyId:null,subjectUserId:'33333333-3333-4333-8333-333333333333',requestType:'ERASURE',status:'IN_REVIEW',legalHold:false,retentionDecision:null}],
      [{count:0}],
    ]);
    const plan=await service.erasurePlan(undefined,'11111111-1111-4111-8111-111111111111');
    expect(plan.executable).toBe(false);
    expect(plan.blockers).toContain('RETENTION_REVIEW_NOT_ALLOWED');
  });

  it('denies foreign society or another subject before reading export datasets',async()=>{
    const {service,prisma,tx}=serviceWith([[]]);
    await expect(service.exportMine(
      '33333333-3333-4333-8333-333333333333',
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
    )).rejects.toThrow('Privacy request not found');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('keeps erasure plan parent and relations on the same tenant transaction',async()=>{
    const {service,tx,prisma}=serviceWith([
      [{id:'case',societyId:'society-a',subjectUserId:'user',requestType:'ERASURE',
        status:'IN_REVIEW',legalHold:true,retentionDecision:'BLOCK'}],
      [{count:0}],
    ]);
    const result=await service.erasurePlan('society-a','case');
    expect(result.blockers).toEqual(['LEGAL_HOLD_ACTIVE','RETENTION_REVIEW_NOT_ALLOWED']);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-a',expect.any(Function));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
