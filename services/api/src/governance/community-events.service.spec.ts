import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe,expect,it,vi } from 'vitest';
import { CommunityEventsService } from './community-events.service';

describe('CommunityEventsService',()=>{
  it.each([undefined,null,1,10000])('accepts optional or bounded capacity %s',async capacity=>{
    const query=vi.fn().mockResolvedValue([{id:'event-1'}]);
    const service=new CommunityEventsService({withTenantContext:vi.fn((_societyId:string,run:(client:Pick<Prisma.TransactionClient,'$queryRaw'>)=>unknown)=>run({$queryRaw:query}))} as never);
    await expect(service.create('society-1','user-1',{
      title:'Community games',audienceScope:'COMMUNITY',
      startsAt:new Date('2027-01-01T10:00:00Z'),endsAt:new Date('2027-01-01T12:00:00Z'),capacity,
    })).resolves.toEqual({id:'event-1'});
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0].values).toContain(capacity??null);
  });

  it.each([0,-1,1.5,10001,NaN])('rejects invalid capacity %s before writing',async capacity=>{
    const query=vi.fn();
    const service=new CommunityEventsService({withTenantContext:vi.fn((_societyId:string,run:(client:Pick<Prisma.TransactionClient,'$queryRaw'>)=>unknown)=>run({$queryRaw:query}))} as never);
    await expect(service.create('society-1','user-1',{
      title:'Community games',audienceScope:'COMMUNITY',
      startsAt:new Date('2027-01-01T10:00:00Z'),endsAt:new Date('2027-01-01T12:00:00Z'),capacity,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('enforces server capacity before inserting a new GOING RSVP',async()=>{
    const tx={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([{id:'event-1',status:'PUBLISHED',audienceScope:'COMMUNITY',capacity:2,rsvpOpen:true,isOwner:false,isOccupant:true}])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{goingCount:2}]),
      $executeRaw:vi.fn(),
    };
    const prisma={withTenantContext:vi.fn((_societyId:string,run:(client:typeof tx)=>unknown)=>run(tx))};
    const service=new CommunityEventsService(prisma as never);
    await expect(service.rsvp('society-1','user-1','event-1','GOING')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('does not expose an owner-only event to a non-owner occupant through the RSVP endpoint',async()=>{
    const tx={
      $queryRaw:vi.fn().mockResolvedValueOnce([{id:'event-1',status:'PUBLISHED',audienceScope:'OWNER_ONLY',capacity:null,rsvpOpen:true,isOwner:false,isOccupant:true}]),
      $executeRaw:vi.fn(),
    };
    const prisma={withTenantContext:vi.fn((_societyId:string,run:(client:typeof tx)=>unknown)=>run(tx))};
    const service=new CommunityEventsService(prisma as never);
    await expect(service.rsvp('society-1','user-1','event-1','GOING')).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('keeps resident listing membership/audience scoped and aggregate-only',async()=>{
    const queryRaw=vi.fn().mockResolvedValue([]);
    const service=new CommunityEventsService({withTenantContext:vi.fn((_societyId:string,run:(client:Pick<Prisma.TransactionClient,'$queryRaw'>)=>unknown)=>run({$queryRaw:queryRaw}))} as never);
    await service.listVisible('society-1','user-1');
    const sql=(queryRaw.mock.calls[0][0] as {strings:readonly string[]}).strings.join(' ');
    expect(sql).toContain('e."status"=\'PUBLISHED\'');
    expect(sql).toContain('"UnitOwnership"');
    expect(sql).toContain('"UnitOccupancy"');
    expect(sql).toContain('e."audienceScope"=\'OWNER_ONLY\'');
    expect(sql).toContain('"goingCount"');
    expect(sql).not.toContain('u."name"');
    expect(sql).not.toContain('u."phone"');
  });
});


describe('Community event tenant transaction boundaries',()=>{
  const society='society-a', user='user-a', event='event-a';
  function fixture(){
    const tx={$queryRaw:vi.fn().mockResolvedValue([]),$executeRaw:vi.fn().mockResolvedValue(1)};
    const prisma={
      withTenantContext:vi.fn((_societyId:string,run:(client:typeof tx)=>unknown)=>run(tx)),
      $queryRaw:vi.fn(()=>{throw new Error('Global client access');}),
      $executeRaw:vi.fn(()=>{throw new Error('Global client access');}),
      $transaction:vi.fn(()=>{throw new Error('Unscoped transaction');}),
    };
    return {tx,prisma,service:new CommunityEventsService(prisma as never)};
  }
  const input={title:'Games',audienceScope:'COMMUNITY' as const,
    startsAt:new Date('2027-01-01T10:00:00Z'),endsAt:new Date('2027-01-01T12:00:00Z')};

  it.each(['listVisible','listManage'] as const)('runs %s on the supplied client',async method=>{
    const {service,prisma,tx}=fixture();
    await service[method](society,user);
    expect(prisma.withTenantContext).toHaveBeenCalledWith(society,expect.any(Function));
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.$queryRaw.mock.calls[0][0].values).toContain(society);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it('creates the event on the supplied client and returns the existing payload',async()=>{
    const {service,prisma,tx}=fixture();
    tx.$queryRaw.mockResolvedValueOnce([{id:event,status:'DRAFT'}]);
    await expect(service.create(society,user,input)).resolves.toEqual({id:event,status:'DRAFT'});
    expect(prisma.withTenantContext).toHaveBeenCalledWith(society,expect.any(Function));
    expect(tx.$queryRaw.mock.calls[0][0].values).toContain(society);
  });
  it('keeps lifecycle locking and writes inside the same tenant transaction',async()=>{
    const {service,prisma,tx}=fixture();
    tx.$queryRaw.mockResolvedValueOnce([{id:event,status:'DRAFT',publishable:true}])
      .mockResolvedValueOnce([{id:event,status:'PUBLISHED'}]);
    await expect(service.setStatus(society,event,'PUBLISHED')).resolves.toEqual({id:event,status:'PUBLISHED'});
    expect(prisma.withTenantContext).toHaveBeenCalledOnce();
    expect(tx.$queryRaw.mock.calls[0][0].strings.join(' ')).toContain('FOR UPDATE');
    for(const [sql] of tx.$queryRaw.mock.calls)expect(sql.values).toContain(society);
  });
  it.each(['setStatus','rsvp'] as const)('rejects inaccessible events before writes in %s',async method=>{
    const {service,tx}=fixture();
    const result=method==='setStatus'?service.setStatus(society,event,'PUBLISHED'):service.rsvp(society,user,event,'GOING');
    await expect(result).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.$queryRaw).toHaveBeenCalledOnce();expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('keeps RSVP checks, capacity, upsert and summary on one tenant client',async()=>{
    const {service,prisma,tx}=fixture();
    tx.$queryRaw.mockResolvedValueOnce([{id:event,status:'PUBLISHED',audienceScope:'COMMUNITY',capacity:1,rsvpOpen:true,isOwner:false,isOccupant:true}])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([{goingCount:0}])
      .mockResolvedValueOnce([{id:event,myRsvp:'GOING',goingCount:1}]);
    await expect(service.rsvp(society,user,event,'GOING')).resolves.toEqual({id:event,myRsvp:'GOING',goingCount:1});
    expect(prisma.withTenantContext).toHaveBeenCalledWith(society,expect.any(Function));
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    for(const [sql] of [...tx.$queryRaw.mock.calls,...tx.$executeRaw.mock.calls])expect(sql.values).toContain(society);
  });
  it('returns the summary without writing when the RSVP is unchanged',async()=>{
    const {service,tx}=fixture();
    tx.$queryRaw.mockResolvedValueOnce([{id:event,status:'PUBLISHED',audienceScope:'COMMUNITY',capacity:1,rsvpOpen:true,isOwner:true,isOccupant:false}])
      .mockResolvedValueOnce([{status:'GOING'}]).mockResolvedValueOnce([{id:event,myRsvp:'GOING'}]);
    await expect(service.rsvp(society,user,event,'GOING')).resolves.toEqual({id:event,myRsvp:'GOING'});
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('preserves cancelled event lifecycle rejection',async()=>{
    const {service,tx}=fixture();
    tx.$queryRaw.mockResolvedValueOnce([{id:event,status:'CANCELLED',publishable:true}]);
    await expect(service.setStatus(society,event,'PUBLISHED')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
  });
  it('does not swallow tenant context failures',async()=>{
    const {service,prisma,tx}=fixture();
    prisma.withTenantContext.mockImplementationOnce(()=>{throw new Error('Context failure');});
    expect(()=>service.listManage(society)).toThrow('Context failure');
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
});
