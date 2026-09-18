import { BadRequestException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { PrivacySubjectDataService } from './privacy-subject-data.service';

function serviceWith(queryResults:unknown[]){
  const prisma={$queryRaw:vi.fn(),$transaction:vi.fn()};
  for(const result of queryResults)prisma.$queryRaw.mockResolvedValueOnce(result);
  return {prisma,service:new PrivacySubjectDataService(prisma as never)};
}

describe('V4 privacy fulfilment closure',()=>{
  it('fails closed when an ACCESS export is requested before completion',async()=>{
    const {service}=serviceWith([[
      {id:'11111111-1111-4111-8111-111111111111',societyId:'22222222-2222-4222-8222-222222222222',subjectUserId:'33333333-3333-4333-8333-333333333333',requestType:'ACCESS',status:'IN_REVIEW',legalHold:false,retentionDecision:null},
    ]]);
    await expect(service.exportMine(
      '33333333-3333-4333-8333-333333333333',
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks erasure while an active society relationship exists even after retention approval',async()=>{
    const {service}=serviceWith([
      [{id:'11111111-1111-4111-8111-111111111111',societyId:'22222222-2222-4222-8222-222222222222',subjectUserId:'33333333-3333-4333-8333-333333333333',requestType:'ERASURE',status:'IN_REVIEW',legalHold:false,retentionDecision:'ALLOW'}],
      [{count:1}],
    ]);
    const plan=await service.erasurePlan('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111');
    expect(plan.executable).toBe(false);
    expect(plan.blockers).toContain('ACTIVE_SOCIETY_RELATIONSHIP');
    expect(plan.retain).toContain('financial/accounting evidence');
  });

  it('blocks account-wide anonymisation while any active account relationship exists',async()=>{
    const {service}=serviceWith([
      [{id:'11111111-1111-4111-8111-111111111111',societyId:null,subjectUserId:'33333333-3333-4333-8333-333333333333',requestType:'ERASURE',status:'IN_REVIEW',legalHold:false,retentionDecision:'ALLOW'}],
      [{count:2}],
    ]);
    const plan=await service.erasurePlan(undefined,'11111111-1111-4111-8111-111111111111');
    expect(plan.executable).toBe(false);
    expect(plan.blockers).toContain('ACTIVE_ACCOUNT_RELATIONSHIP');
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
});
