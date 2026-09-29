import { ConflictException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { AmenitiesService } from './amenities.service';

describe('V4.74 amenity blackout convergence',()=>{
  it('previews impacted booking and waitlist evidence without mutation',async()=>{
    const queryRaw=vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{schedule:{blackouts:[]}}])
      .mockResolvedValueOnce([{id:'b1',unitNumber:'A-101',buildingName:'A',status:'CONFIRMED',startsAt:new Date(),endsAt:new Date()}])
      .mockResolvedValueOnce([{id:'w1',unitNumber:'A-102',startsAt:new Date(),endsAt:new Date()}]);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof queryRaw})=>Promise<unknown>)=>cb({$queryRaw:queryRaw}));
    const service=new AmenitiesService({$transaction:transaction} as never);
    const result=await service.previewBlackout('s1','a1',{startsAt:'2099-01-01T10:00:00.000Z',endsAt:'2099-01-01T12:00:00.000Z',reason:'Maintenance'});
    expect(result).toMatchObject({canApply:false,mutationPerformed:false,automaticCancellation:false});
    expect(result.impactedBookings).toHaveLength(1);
    expect(result.impactedWaitlist).toHaveLength(1);
  });

  it('fails closed instead of applying a blackout over active reservations',async()=>{
    const queryRaw=vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{schedule:{blackouts:[]}}])
      .mockResolvedValueOnce([{id:'b1'}])
      .mockResolvedValueOnce([]);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof queryRaw})=>Promise<unknown>)=>cb({$queryRaw:queryRaw}));
    const service=new AmenitiesService({$transaction:transaction} as never);
    await expect(service.applyBlackout('s1','a1',{startsAt:'2099-01-01T10:00:00.000Z',endsAt:'2099-01-01T12:00:00.000Z',reason:'Maintenance'}))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('applies a clear blackout only after revalidation',async()=>{
    const queryRaw=vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{schedule:{weekly:{mon:[{start:'09:00',end:'18:00'}]},blackouts:[]}}])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{schedule:{weekly:{mon:[{start:'09:00',end:'18:00'}]},blackouts:[]}}]);
    const executeRaw=vi.fn().mockResolvedValue(1);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof queryRaw;$executeRaw:typeof executeRaw})=>Promise<unknown>)=>cb({$queryRaw:queryRaw,$executeRaw:executeRaw}));
    const service=new AmenitiesService({$transaction:transaction} as never);
    const result=await service.applyBlackout('s1','a1',{startsAt:'2099-01-01T10:00:00.000Z',endsAt:'2099-01-01T12:00:00.000Z',kind:'CLOSURE',reason:'Repairs'});
    expect(result).toMatchObject({automaticCancellation:false,blackout:{kind:'CLOSURE',reason:'Repairs'}});
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });
});
