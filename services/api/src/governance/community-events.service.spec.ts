import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { CommunityEventsService } from './community-events.service';

describe('CommunityEventsService',()=>{
  it.each([undefined,null,1,10000])('accepts optional or bounded capacity %s',async capacity=>{
    const query=vi.fn().mockResolvedValue([{id:'event-1'}]);
    const service=new CommunityEventsService({$queryRaw:query} as never);
    await expect(service.create('society-1','user-1',{
      title:'Community games',audienceScope:'COMMUNITY',
      startsAt:new Date('2027-01-01T10:00:00Z'),endsAt:new Date('2027-01-01T12:00:00Z'),capacity,
    })).resolves.toEqual({id:'event-1'});
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0].values).toContain(capacity??null);
  });

  it.each([0,-1,1.5,10001,NaN])('rejects invalid capacity %s before writing',async capacity=>{
    const query=vi.fn();
    const service=new CommunityEventsService({$queryRaw:query} as never);
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
    const prisma={$transaction:vi.fn((run:(client:typeof tx)=>unknown)=>run(tx))};
    const service=new CommunityEventsService(prisma as never);
    await expect(service.rsvp('society-1','user-1','event-1','GOING')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('does not expose an owner-only event to a non-owner occupant through the RSVP endpoint',async()=>{
    const tx={
      $queryRaw:vi.fn().mockResolvedValueOnce([{id:'event-1',status:'PUBLISHED',audienceScope:'OWNER_ONLY',capacity:null,rsvpOpen:true,isOwner:false,isOccupant:true}]),
      $executeRaw:vi.fn(),
    };
    const prisma={$transaction:vi.fn((run:(client:typeof tx)=>unknown)=>run(tx))};
    const service=new CommunityEventsService(prisma as never);
    await expect(service.rsvp('society-1','user-1','event-1','GOING')).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('keeps resident listing membership/audience scoped and aggregate-only',async()=>{
    const queryRaw=vi.fn().mockResolvedValue([]);
    const service=new CommunityEventsService({$queryRaw:queryRaw} as never);
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
