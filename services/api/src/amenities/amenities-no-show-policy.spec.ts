import { BadRequestException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { AmenitiesService } from './amenities.service';

const society='11111111-1111-4111-8111-111111111111';
const user='22222222-2222-4222-8222-222222222222';
const amenity='33333333-3333-4333-8333-333333333333';
const unit='44444444-4444-4444-8444-444444444444';

describe('V4.77 amenity no-show fair-use policy',()=>{
  it('rejects partial no-show policy configuration',async()=>{
    const service=new AmenitiesService({$queryRaw:vi.fn()} as never);
    await expect(service.createAmenity(society,{
      code:'COURT',
      name:'Court',
      bookingRules:{noShowRestrictionCount:2,noShowLookbackDays:30},
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks a new booking while the resident-specific pause is active',async()=>{
    const queryRaw=vi.fn().mockResolvedValueOnce([{allowed:true}]);
    const latest=new Date();
    const txQueryRaw=vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id:amenity,societyId:society,code:'COURT',name:'Court',description:null,location:null,schedule:{},
        bookingRules:{noShowRestrictionCount:2,noShowLookbackDays:30,noShowBlockDays:7},
        feePaise:0,currency:'INR',requiresApproval:false,slotMinutes:60,maxConcurrentBookings:1,active:true,
      }])
      .mockResolvedValueOnce([{noShowCount:2,latestNoShowAt:latest}]);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof txQueryRaw})=>Promise<unknown>)=>cb({$queryRaw:txQueryRaw}));
    const service=new AmenitiesService({$queryRaw:queryRaw,$transaction:transaction} as never);
    await expect(service.createBooking(society,user,amenity,{
      unitId:unit,startsAt:'2099-01-01T10:00:00.000Z',endsAt:'2099-01-01T11:00:00.000Z',
    })).rejects.toThrow('paused until');
  });

  it('blocks a new waitlist join under the same resident-specific pause',async()=>{
    const queryRaw=vi.fn().mockResolvedValueOnce([{allowed:true}]);
    const txQueryRaw=vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id:amenity,societyId:society,code:'COURT',name:'Court',description:null,location:null,schedule:{},
        bookingRules:{noShowRestrictionCount:2,noShowLookbackDays:30,noShowBlockDays:7},
        feePaise:0,currency:'INR',requiresApproval:false,slotMinutes:60,maxConcurrentBookings:1,active:true,
      }])
      .mockResolvedValueOnce([{noShowCount:2,latestNoShowAt:new Date()}]);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof txQueryRaw})=>Promise<unknown>)=>cb({$queryRaw:txQueryRaw}));
    const service=new AmenitiesService({$queryRaw:queryRaw,$transaction:transaction} as never);
    await expect(service.joinWaitlist(society,user,amenity,{
      unitId:unit,startsAt:'2099-01-01T10:00:00.000Z',endsAt:'2099-01-01T11:00:00.000Z',
    })).rejects.toThrow('paused until');
  });

  it('allows booking after the configured pause has expired',async()=>{
    const queryRaw=vi.fn().mockResolvedValueOnce([{allowed:true}]);
    const old=new Date(Date.now()-10*24*60*60*1000);
    const booking={id:'booking-1',status:'CONFIRMED'};
    const txQueryRaw=vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id:amenity,societyId:society,code:'COURT',name:'Court',description:null,location:null,schedule:{},
        bookingRules:{noShowRestrictionCount:2,noShowLookbackDays:30,noShowBlockDays:7},
        feePaise:0,currency:'INR',requiresApproval:false,slotMinutes:60,maxConcurrentBookings:2,active:true,
      }])
      .mockResolvedValueOnce([{noShowCount:2,latestNoShowAt:old}])
      .mockResolvedValueOnce([{count:0}])
      .mockResolvedValueOnce([booking]);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof txQueryRaw})=>Promise<unknown>)=>cb({$queryRaw:txQueryRaw}));
    const service=new AmenitiesService({$queryRaw:queryRaw,$transaction:transaction} as never);
    await expect(service.createBooking(society,user,amenity,{
      unitId:unit,startsAt:'2099-01-01T10:00:00.000Z',endsAt:'2099-01-01T11:00:00.000Z',
    })).resolves.toEqual(booking);
  });
});
