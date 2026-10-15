import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { AmenitiesService } from './amenities.service';

const society='11111111-1111-4111-8111-111111111111';
const user='22222222-2222-4222-8222-222222222222';
const amenity='33333333-3333-4333-8333-333333333333';
const unit='44444444-4444-4444-8444-444444444444';
const booking='55555555-5555-4555-8555-555555555555';

const amenityRow={
  id:amenity,societyId:society,code:'COURT',name:'Court',description:null,location:null,
  schedule:{},bookingRules:{},feePaise:0,currency:'INR',requiresApproval:false,slotMinutes:60,maxConcurrentBookings:1,active:true,
};

describe('V4.12 amenity waitlist',()=>{
  it('allows a property-scoped resident to join only when capacity is exhausted',async()=>{
    const queryRaw=vi.fn().mockResolvedValueOnce([{allowed:true}]);
    const startsAt=new Date(Date.now()+24*60*60*1000),endsAt=new Date(startsAt.getTime()+60*60*1000);
    const txQuery=vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([amenityRow])
      .mockResolvedValueOnce([{count:0}])
      .mockResolvedValueOnce([{count:1}])
      .mockResolvedValueOnce([{id:'66666666-6666-4666-8666-666666666666',joinedAt:new Date(),status:'WAITING'}])
      .mockResolvedValueOnce([{position:2}]);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof txQuery })=>Promise<unknown>)=>cb({$queryRaw:txQuery}));
    const service=new AmenitiesService({$queryRaw:queryRaw,$transaction:transaction} as unknown as PrismaService);
    await expect(service.joinWaitlist(society,user,amenity,{unitId:unit,startsAt:startsAt.toISOString(),endsAt:endsAt.toISOString()}))
      .resolves.toMatchObject({status:'WAITING',position:2});
  });

  it('refuses waitlist entry while the slot can still be booked normally',async()=>{
    const queryRaw=vi.fn().mockResolvedValueOnce([{allowed:true}]);
    const startsAt=new Date(Date.now()+24*60*60*1000),endsAt=new Date(startsAt.getTime()+60*60*1000);
    const txQuery=vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([amenityRow])
      .mockResolvedValueOnce([{count:0}])
      .mockResolvedValueOnce([{count:0}]);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof txQuery })=>Promise<unknown>)=>cb({$queryRaw:txQuery}));
    const service=new AmenitiesService({$queryRaw:queryRaw,$transaction:transaction} as unknown as PrismaService);
    await expect(service.joinWaitlist(society,user,amenity,{unitId:unit,startsAt:startsAt.toISOString(),endsAt:endsAt.toISOString()}))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('promotes the oldest eligible waiter when a future booking is cancelled',async()=>{
    const startsAt=new Date(Date.now()+24*60*60*1000),endsAt=new Date(startsAt.getTime()+60*60*1000);
    const cancelled={id:booking,status:'CANCELLED'};
    const waiter={id:'66666666-6666-4666-8666-666666666666',unitId:unit,userId:user,startsAt,endsAt};
    const txQuery=vi.fn()
      .mockResolvedValueOnce([{amenityId:amenity,startsAt,endsAt,bookingRules:{}}])
      .mockResolvedValueOnce([cancelled])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([amenityRow])
      .mockResolvedValueOnce([{count:0}])
      .mockResolvedValueOnce([waiter])
      .mockResolvedValueOnce([{id:'77777777-7777-4777-8777-777777777777'}])
      .mockResolvedValueOnce([]);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof txQuery })=>Promise<unknown>)=>cb({$queryRaw:txQuery}));
    const service=new AmenitiesService({$queryRaw:vi.fn(),$transaction:transaction} as unknown as PrismaService);
    await expect(service.cancelMine(society,user,booking)).resolves.toEqual(cancelled);
    const promotionSql=(txQuery.mock.calls[6][0] as readonly string[]).join(' ');
    expect(promotionSql).toContain('INSERT INTO "AmenityBooking"');
    const closeSql=(txQuery.mock.calls[7][0] as readonly string[]).join(' ');
    expect(closeSql).toContain('"status"=\'PROMOTED\'');
  });

  it('lets only the owning resident cancel an active waitlist entry',async()=>{
    const queryRaw=vi.fn().mockResolvedValueOnce([]);
    const service=new AmenitiesService({$queryRaw:queryRaw,$transaction:vi.fn()} as unknown as PrismaService);
    await expect(service.cancelWaitlistMine(society,user,'66666666-6666-4666-8666-666666666666'))
      .rejects.toBeInstanceOf(NotFoundException);
    const sql=(queryRaw.mock.calls[0][0] as readonly string[]).join(' ');
    expect(sql).toContain('"societyId"=');
    expect(sql).toContain('"userId"=');
  });
});
