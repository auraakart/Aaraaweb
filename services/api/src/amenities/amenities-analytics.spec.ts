import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { AmenitiesService } from './amenities.service';

describe('V4.12 amenity operations analytics',()=>{
  it('returns tenant-scoped descriptive metrics without mutation or prediction',async()=>{
    const queryRaw=vi.fn()
      .mockResolvedValueOnce([{bookingCount:12,completedCount:7,checkedInCount:1,noShowCount:1,cancelledCount:2,rejectedCount:1,waitingCount:3,promotedCount:2}])
      .mockResolvedValueOnce([{amenityId:'a1',amenityName:'Court',bookingCount:6,waitlistJoinCount:4,noShowCount:1}]);
    const executeRaw=vi.fn();
    const service=new AmenitiesService({$queryRaw:queryRaw,$executeRaw:executeRaw} as unknown as PrismaService);
    const result=await service.analytics('11111111-1111-4111-8111-111111111111');
    expect(result).toMatchObject({
      periodDays:30,predictive:false,
      summary:{
        bookingCount:12,
        attendanceEligibleCount:8,
        attendanceRatePct:87.5,
        cancellationRatePct:16.7,
        noShowRatePct:12.5,
        waitlistPromotionRatePct:40,
      },
      demand:[{amenityName:'Court',demandSignals:10,demandRank:1,demandSharePct:100}],
    });
    expect(executeRaw).not.toHaveBeenCalled();
    for(const call of queryRaw.mock.calls){
      expect(call.slice(1)).toContain('11111111-1111-4111-8111-111111111111');
    }
  });

  it('returns zero attendance rate when there are no finalized attendance outcomes',async()=>{
    const queryRaw=vi.fn()
      .mockResolvedValueOnce([{bookingCount:0,completedCount:0,checkedInCount:0,noShowCount:0,cancelledCount:0,rejectedCount:0,waitingCount:0,promotedCount:0}])
      .mockResolvedValueOnce([]);
    const service=new AmenitiesService({$queryRaw:queryRaw} as unknown as PrismaService);
    const result=await service.analytics('11111111-1111-4111-8111-111111111111');
    expect(result.summary.attendanceRatePct).toBe(0);
    expect(result.summary.cancellationRatePct).toBe(0);
    expect(result.summary.noShowRatePct).toBe(0);
    expect(result.summary.waitlistPromotionRatePct).toBe(0);
    expect(result.demand).toEqual([]);
  });
});
