import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { CommunityEventsService } from './community-events.service';

describe('CommunityEventsService',()=>{
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
