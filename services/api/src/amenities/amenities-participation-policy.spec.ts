import { BadRequestException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { AmenitiesService } from './amenities.service';

const society='11111111-1111-4111-8111-111111111111';
const user='22222222-2222-4222-8222-222222222222';
const amenity='33333333-3333-4333-8333-333333333333';
const unit='44444444-4444-4444-8444-444444444444';

describe('V4.73 amenity participation policy',()=>{
  it('rejects guests when the amenity does not enable companions',async()=>{
    const queryRaw=vi.fn().mockResolvedValueOnce([{allowed:true}]);
    const txQueryRaw=vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{id:amenity,societyId:society,code:'GYM',name:'Gym',description:null,location:null,schedule:{},bookingRules:{},feePaise:0,currency:'INR',requiresApproval:false,slotMinutes:60,maxConcurrentBookings:2,active:true}]);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof txQueryRaw})=>Promise<unknown>)=>cb({$queryRaw:txQueryRaw}));
    const service=new AmenitiesService({$queryRaw:queryRaw,$transaction:transaction} as never);
    await expect(service.createBooking(society,user,amenity,{unitId:unit,startsAt:'2099-01-01T10:00:00.000Z',endsAt:'2099-01-01T11:00:00.000Z',guestCount:1}))
      .rejects.toThrow('Guests are not enabled');
  });

  it('rejects a guest count above the configured maximum',async()=>{
    const queryRaw=vi.fn().mockResolvedValueOnce([{allowed:true}]);
    const txQueryRaw=vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{id:amenity,societyId:society,code:'HALL',name:'Hall',description:null,location:null,schedule:{},bookingRules:{maxGuestsPerBooking:3},feePaise:0,currency:'INR',requiresApproval:false,slotMinutes:60,maxConcurrentBookings:2,active:true}]);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof txQueryRaw})=>Promise<unknown>)=>cb({$queryRaw:txQueryRaw}));
    const service=new AmenitiesService({$queryRaw:queryRaw,$transaction:transaction} as never);
    await expect(service.createBooking(society,user,amenity,{unitId:unit,startsAt:'2099-01-01T10:00:00.000Z',endsAt:'2099-01-01T11:00:00.000Z',guestCount:4}))
      .rejects.toThrow('at most 3 guests');
  });

  it('treats guest count as part of the idempotent booking payload',async()=>{
    const queryRaw=vi.fn().mockResolvedValueOnce([{allowed:true}]);
    const txQueryRaw=vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{id:'booking-1',amenityId:amenity,unitId:unit,startsAt:new Date('2099-01-01T10:00:00.000Z'),endsAt:new Date('2099-01-01T11:00:00.000Z'),guestCount:1}]);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof txQueryRaw})=>Promise<unknown>)=>cb({$queryRaw:txQueryRaw}));
    const service=new AmenitiesService({$queryRaw:queryRaw,$transaction:transaction} as never);
    await expect(service.createBooking(society,user,amenity,{unitId:unit,startsAt:'2099-01-01T10:00:00.000Z',endsAt:'2099-01-01T11:00:00.000Z',guestCount:2,idempotencyKey:'guest-payload-1'}))
      .rejects.toThrow('Idempotency key is already used');
  });

  it('rejects an amenity guest policy above the global safety cap',async()=>{
    const service=new AmenitiesService({$queryRaw:vi.fn()} as never);
    await expect(service.createAmenity(society,{code:'HALL',name:'Hall',bookingRules:{maxGuestsPerBooking:51}}))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks reducing the guest limit below future booking or waitlist participation',async()=>{
    const txQueryRaw=vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id:amenity,societyId:society,code:'HALL',name:'Hall',description:null,location:null,schedule:{},
        bookingRules:{maxGuestsPerBooking:4},feePaise:0,currency:'INR',requiresApproval:false,
        slotMinutes:60,maxConcurrentBookings:2,active:true,
      }])
      .mockResolvedValueOnce([{maxGuestCount:3}]);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof txQueryRaw})=>Promise<unknown>)=>cb({$queryRaw:txQueryRaw}));
    const service=new AmenitiesService({$transaction:transaction} as never);
    await expect(service.updateAmenity(society,amenity,{
      name:'Hall',description:null,location:null,schedule:{},bookingRules:{maxGuestsPerBooking:2},
      feePaise:0,requiresApproval:false,slotMinutes:60,maxConcurrentBookings:2,active:true,
    })).rejects.toThrow('Guest limit cannot be reduced below 3');
  });
});
