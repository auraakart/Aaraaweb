import { ConflictException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { AmenitiesService } from './amenities.service';

describe('V4.76 amenity operating-hours convergence',()=>{
  it('rejects waitlist joins on a configured closed day',async()=>{
    const queryRaw=vi.fn().mockResolvedValueOnce([{allowed:true}]);
    const txQueryRaw=vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{id:'a1',societyId:'s1',code:'HALL',name:'Hall',description:null,location:null,schedule:{weekly:{mon:[],tue:[],wed:[],thu:[],fri:[],sat:[],sun:[]}},bookingRules:{},feePaise:0,currency:'INR',requiresApproval:false,slotMinutes:60,maxConcurrentBookings:1,active:true}]);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof txQueryRaw})=>Promise<unknown>)=>cb({$queryRaw:txQueryRaw}));
    const service=new AmenitiesService({$queryRaw:queryRaw,$transaction:transaction} as never);
    await expect(service.joinWaitlist('s1','u1','a1',{unitId:'unit1',startsAt:'2099-01-05T10:00:00.000Z',endsAt:'2099-01-05T11:00:00.000Z'})).rejects.toThrow('closed for the requested India-local day');
  });

  it('previews operating-hour changes without mutation and exposes blockers',async()=>{
    const queryRaw=vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{id:'a1'}]).mockResolvedValueOnce([{bookingCount:2,waitlistCount:1}]);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof queryRaw})=>Promise<unknown>)=>cb({$queryRaw:queryRaw}));
    const service=new AmenitiesService({$transaction:transaction} as never);
    const weekly={mon:[{start:'06:00',end:'22:00'}],tue:[],wed:[],thu:[],fri:[],sat:[],sun:[]};
    const result=await service.previewOperatingHours('s1','a1',weekly);
    expect(result).toMatchObject({futureBookingCount:2,futureWaitlistCount:1,canApply:false,mutationPerformed:false});
  });

  it('fails closed if waiting entries appear before apply',async()=>{
    const queryRaw=vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{schedule:{blackouts:[]}}]).mockResolvedValueOnce([{bookingCount:0,waitlistCount:1}]);
    const executeRaw=vi.fn();
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof queryRaw;$executeRaw:typeof executeRaw})=>Promise<unknown>)=>cb({$queryRaw:queryRaw,$executeRaw:executeRaw}));
    const service=new AmenitiesService({$transaction:transaction} as never);
    const weekly={mon:[{start:'06:00',end:'22:00'}],tue:[],wed:[],thu:[],fri:[],sat:[],sun:[]};
    await expect(service.applyOperatingHours('s1','a1',weekly)).rejects.toBeInstanceOf(ConflictException);
  });
});
