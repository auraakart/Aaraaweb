import { describe, expect, it, vi } from 'vitest';
import { ProviderMarketplaceCompletionService } from './provider-marketplace-completion.service';

const userId='11111111-1111-4111-8111-111111111111';
const bookingId='22222222-2222-4222-8222-222222222222';
const providerId='33333333-3333-4333-8333-333333333333';

function setup() {
  const prisma={ $queryRaw:vi.fn() };
  const operators={ resolveProvider:vi.fn() };
  const availability={};
  const service=new ProviderMarketplaceCompletionService(
    prisma as unknown as ConstructorParameters<typeof ProviderMarketplaceCompletionService>[0],
    operators as unknown as ConstructorParameters<typeof ProviderMarketplaceCompletionService>[1],
    availability as unknown as ConstructorParameters<typeof ProviderMarketplaceCompletionService>[2],
  );
  return { prisma, service };
}

describe('Services 4.0.5 — review-only rework requests', () => {
  it('rejects another consumer booking before disclosing captured terms',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.getConsumerReworkTerms(userId,bookingId)).rejects.toThrow('Booking not found');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it('does not allow rework before service completion',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([{id:bookingId,userId,providerId,status:'IN_PROGRESS'}]);
    await expect(service.getConsumerReworkTerms(userId,bookingId)).rejects.toThrow('completed services');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it('presents expired captured warranty as review-only, never a guarantee',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([{id:bookingId,userId,providerId,status:'COMPLETED'}])
      .mockResolvedValueOnce([{warrantyDays:30,revisitPolicy:'One revisit',warrantyStartedAt:new Date('2025-01-01'),warrantyUntil:new Date('2025-02-01')}]);
    const context=await service.getConsumerReworkTerms(userId,bookingId);
    expect(context.status).toBe('PERIOD_EXPIRED');
    expect(context.guaranteedRework).toBe(false);
    expect(context.chargeAuthorized).toBe(false);
    const sql=prisma.$queryRaw.mock.calls[1][0] as {strings:string[],values:unknown[]};
    expect(sql.strings.join(' ')).toContain('b."userId"');
    expect(sql.values).toEqual([bookingId,userId]);
  });
  it('discloses no warranty entitlement when legacy terms are absent',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([{id:bookingId,userId,providerId,status:'COMPLETED'}]).mockResolvedValueOnce([]);
    const context=await service.getConsumerReworkTerms(userId,bookingId);
    expect(context.status).toBe('NO_CAPTURED_TERMS');
    expect(context.capturedTerms).toBe(null);
    expect(context.reviewRequired).toBe(true);
  });
  it('creates an existing dispute case tagged rework, with no charge/guarantee',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([{id:bookingId,userId,providerId,status:'COMPLETED'}])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{id:bookingId,userId,providerId,status:'COMPLETED'}])
      .mockResolvedValueOnce([{id:'44444444-4444-4444-8444-444444444444',reasonCode:'REWORK_REQUEST',status:'OPEN'}]);
    const result=await service.requestConsumerRework(userId,bookingId,'Service did not resolve issue');
    expect(result.reworkReview.guaranteedRework).toBe(false);
    expect(result.reasonCode).toBe('REWORK_REQUEST');
    const query=prisma.$queryRaw.mock.calls[3][0] as {strings:string[],values:unknown[]};
    expect(query.strings.join(' ')).toContain('ConsumerServiceDispute');
    expect(query.values).toContain('REWORK_REQUEST');
    expect(query.values).toContain(userId);
  });
  it('rejects empty rework reason before touching booking or dispute data',async()=>{
    const {prisma,service}=setup();
    await expect(service.requestConsumerRework(userId,bookingId,'  ')).rejects.toThrow('Rework description');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
