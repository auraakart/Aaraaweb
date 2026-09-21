import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HelpdeskService } from './helpdesk.service';

describe('HelpdeskService reviewer context and assignment', () => {
  it('returns active society members as reviewer context', async () => {
    const prisma={$queryRaw:vi.fn().mockResolvedValue([{id:'u1',name:'Reviewer',phone:'+919000000001'}])};
    const service=new HelpdeskService(prisma as never);
    await expect(service.reviewContext('society-1')).resolves.toEqual([{id:'u1',name:'Reviewer',phone:'+919000000001'}]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects assignment to a user outside the active society membership', async () => {
    const prisma={societyMembership:{findFirst:vi.fn().mockResolvedValue(null)}};
    const service=new HelpdeskService(prisma as never);
    await expect(service.assign('society-1','actor-1','ticket-1','user-2')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fails closed when the ticket is missing', async () => {
    const tx={$queryRaw:vi.fn().mockResolvedValueOnce([]),$executeRaw:vi.fn()};
    const prisma={
      societyMembership:{findFirst:vi.fn().mockResolvedValue({id:'membership-1'})},
      $transaction:vi.fn(async(cb:(client:unknown)=>unknown)=>cb(tx)),
    };
    const service=new HelpdeskService(prisma as never);
    await expect(service.assign('society-1','actor-1','ticket-1','user-2')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates assignment and appends ASSIGNED activity', async () => {
    const current={id:'ticket-1',societyId:'society-1',status:'OPEN',assignedToId:null};
    const updated={...current,assignedToId:'user-2'};
    const tx={
      $queryRaw:vi.fn().mockResolvedValueOnce([current]).mockResolvedValueOnce([updated]),
      $executeRaw:vi.fn().mockResolvedValue(1),
    };
    const prisma={
      societyMembership:{findFirst:vi.fn().mockResolvedValue({id:'membership-1'})},
      $transaction:vi.fn(async(cb:(client:unknown)=>unknown)=>cb(tx)),
    };
    const service=new HelpdeskService(prisma as never);
    await expect(service.assign('society-1','actor-1','ticket-1','user-2')).resolves.toEqual(updated);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects reassignment of resolved or closed tickets', async () => {
    const current={id:'ticket-1',societyId:'society-1',status:'RESOLVED',assignedToId:null};
    const tx={$queryRaw:vi.fn().mockResolvedValueOnce([current]),$executeRaw:vi.fn()};
    const prisma={
      societyMembership:{findFirst:vi.fn().mockResolvedValue({id:'membership-1'})},
      $transaction:vi.fn(async(cb:(client:unknown)=>unknown)=>cb(tx)),
    };
    const service=new HelpdeskService(prisma as never);
    await expect(service.assign('society-1','actor-1','ticket-1','user-2')).rejects.toThrow('Resolved or closed tickets cannot be reassigned');
  });
});
