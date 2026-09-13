import { describe, expect, it, vi } from 'vitest';
import { ProviderTrustReviewService } from './provider-trust-review.service';

describe('ProviderTrustReviewService',()=>{
  it('keeps earned recommendation separate from reviewed public tier',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValue([{providerId:'11111111-1111-1111-1111-111111111111',businessName:'Provider A',qualityTier:'STANDARD',qualityNote:null,reviewedByUserId:null,reviewedAt:null}])} as any;
    const ratings={providerTrustSummaries:vi.fn().mockResolvedValue([{providerId:'11111111-1111-1111-1111-111111111111',ratingCount:20,averageStars:4.7,completedJobs:52,earnedQualityTier:'PREMIUM'}])} as any;
    const result=await new ProviderTrustReviewService(prisma,ratings).listRecommendations();
    expect(result[0]).toMatchObject({earnedQualityTier:'PREMIUM',currentQualityTier:'STANDARD',reviewNeeded:true});
  });

  it('requires explicit reviewer evidence before changing the public tier',async()=>{
    const prisma={serviceProvider:{findUnique:vi.fn().mockResolvedValue({id:'11111111-1111-1111-1111-111111111111',verification:'VERIFIED',active:true})},$executeRaw:vi.fn().mockResolvedValue(1),$queryRaw:vi.fn().mockResolvedValue([{providerId:'11111111-1111-1111-1111-111111111111',businessName:'Provider A',qualityTier:'TRUSTED',qualityNote:'Reviewed evidence',reviewedByUserId:'22222222-2222-2222-2222-222222222222',reviewedAt:new Date()}])} as any;
    const ratings={providerTrustSummaries:vi.fn().mockResolvedValue([{providerId:'11111111-1111-1111-1111-111111111111',ratingCount:12,averageStars:4.5,completedJobs:30,earnedQualityTier:'TRUSTED'}])} as any;
    const service=new ProviderTrustReviewService(prisma,ratings);
    await expect(service.setReviewedTier('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','TRUSTED','   ')).rejects.toThrow('Trust review note is required');
    await service.setReviewedTier('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','TRUSTED','Reviewed evidence');
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
