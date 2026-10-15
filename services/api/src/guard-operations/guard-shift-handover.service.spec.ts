import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { GuardShiftHandoverService } from './guard-shift-handover.service';

function setup(){
  const prisma={$queryRaw:vi.fn()};
  return {
    prisma,
    service:new GuardShiftHandoverService(prisma as unknown as ConstructorParameters<typeof GuardShiftHandoverService>[0]),
  };
}

describe('GuardShiftHandoverService',()=>{
  it('creates an auditable society-scoped handover after validating the active gate',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{id:'gate-1'}])
      .mockResolvedValueOnce([{id:'handover-1',status:'OPEN',summary:'Pending delivery',openItems:['Parcel at desk']}]);

    await expect(service.create('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',{
      gateId:'33333333-3333-4333-8333-333333333333',summary:' Pending delivery ',openItems:[' Parcel at desk '],
    })).resolves.toEqual(expect.objectContaining({id:'handover-1',status:'OPEN'}));
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid active-society gate',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.create('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',{
      gateId:'33333333-3333-4333-8333-333333333333',summary:'Handover summary',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows only a different guard to acknowledge an open handover',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([{id:'handover-1',status:'ACKNOWLEDGED',incomingGuardUserId:'user-2'}]);
    await expect(service.acknowledge('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'))
      .resolves.toEqual(expect.objectContaining({status:'ACKNOWLEDGED'}));
  });

  it('fails closed when a handover is not open or the outgoing guard tries to acknowledge it',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.acknowledge('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
