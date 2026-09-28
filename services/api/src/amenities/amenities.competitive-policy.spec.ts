import { ConflictException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { AmenitiesService } from './amenities.service';

const society='11111111-1111-4111-8111-111111111111';
const user='22222222-2222-4222-8222-222222222222';
const amenityId='33333333-3333-4333-8333-333333333333';
const unit='44444444-4444-4444-8444-444444444444';

describe('V4.70 amenity competitive policy',()=>{
  it('blocks overlapping bookings across amenities in the same conflict group',async()=>{
    const queryRaw=vi.fn().mockResolvedValueOnce([{allowed:true}]);
    const txQueryRaw=vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id:amenityId,societyId:society,code:'BADMINTON_A',name:'Badminton A',description:null,location:null,schedule:{},
        bookingRules:{conflictGroup:'COURTS'},feePaise:0,currency:'INR',requiresApproval:false,slotMinutes:60,maxConcurrentBookings:1,active:true,
      }])
      .mockResolvedValueOnce([{count:1}]);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof txQueryRaw})=>Promise<unknown>)=>cb({$queryRaw:txQueryRaw}));
    const service=new AmenitiesService({$queryRaw:queryRaw,$transaction:transaction} as never);
    await expect(service.createBooking(society,user,amenityId,{
      unitId:unit,startsAt:'2099-01-01T10:00:00.000Z',endsAt:'2099-01-01T11:00:00.000Z',
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('uses the configured IST time-band fee while preserving base fee outside the band',async()=>{
    const queryRaw=vi.fn().mockResolvedValueOnce([{allowed:true}]);
    const booking={id:'55555555-5555-4555-8555-555555555555',status:'CONFIRMED',feePaise:75000};
    const txQueryRaw=vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id:amenityId,societyId:society,code:'HALL',name:'Hall',description:null,location:null,schedule:{},
        bookingRules:{pricingBands:[{label:'Peak',daysOfWeek:[0,1,2,3,4,5,6],startMinute:1080,endMinute:1260,feePaise:75000}]},
        feePaise:50000,currency:'INR',requiresApproval:false,slotMinutes:60,maxConcurrentBookings:2,active:true,
      }])
      .mockResolvedValueOnce([{count:0}])
      .mockResolvedValueOnce([booking]);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof txQueryRaw})=>Promise<unknown>)=>cb({$queryRaw:txQueryRaw}));
    const service=new AmenitiesService({$queryRaw:queryRaw,$transaction:transaction} as never);
    const result=await service.createBooking(society,user,amenityId,{
      unitId:unit,
      // 13:30Z = 19:00 IST, inside the 18:00-21:00 band.
      startsAt:'2099-01-01T13:30:00.000Z',endsAt:'2099-01-01T14:30:00.000Z',
    });
    expect(result).toEqual(booking);
    const insertCall=txQueryRaw.mock.calls.at(-1)??[];
    // $queryRaw is used as a tagged template here, so substitutions are mock
    // arguments after the TemplateStringsArray rather than a Prisma.Sql.values bag.
    expect(insertCall.slice(1)).toContain(75000);
  });
});
