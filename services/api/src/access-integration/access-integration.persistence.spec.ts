import { NotFoundException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { AccessIntegrationService } from './access-integration.service';

function setup(){
  const prisma={
    $queryRaw:vi.fn(),
    $executeRaw:vi.fn().mockResolvedValue(1),
  };
  return {
    prisma,
    service:new AccessIntegrationService(prisma as unknown as ConstructorParameters<typeof AccessIntegrationService>[0]),
  };
}

const device={
  id:'11111111-1111-4111-8111-111111111111',
  societyId:'22222222-2222-4222-8222-222222222222',
  gateId:'33333333-3333-4333-8333-333333333333',
  adapterKind:'BOOM_BARRIER' as const,
  deviceKey:'boom-1',displayName:'Main boom',active:true,health:'ONLINE' as const,
};

describe('V3.7 access integration persistence',()=>{
  it('fails closed when a device is not in the active society',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.commandDevice('society-1','user-1',device.id,{
      idempotencyKey:'persistent-0001',command:'OPEN',
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('returns an existing command receipt instead of executing a duplicate command',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([device])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{id:'44444444-4444-4444-8444-444444444444',status:'SUCCEEDED',result:{accepted:true,state:'OPEN'}}]);

    await expect(service.commandDevice(device.societyId,'user-1',device.id,{
      idempotencyKey:'persistent-0002',command:'OPEN',
    })).resolves.toEqual(expect.objectContaining({
      id:'44444444-4444-4444-8444-444444444444',idempotent:true,deviceId:device.id,
    }));
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('stores offline command failure evidence without affecting manual gate paths',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([device])
      .mockResolvedValueOnce([{id:'55555555-5555-4555-8555-555555555555',status:'PENDING',result:null}]);
    service.setSimulatorHealth(device.societyId,'BOOM_BARRIER','OFFLINE');

    await expect(service.commandDevice(device.societyId,'user-1',device.id,{
      idempotencyKey:'persistent-0003',command:'OPEN',
    })).resolves.toEqual(expect.objectContaining({
      status:'FAILED',result:expect.objectContaining({accepted:false,state:'DEVICE_OFFLINE'}),
    }));
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('returns an existing event for a duplicate external event id',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([device])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id:'66666666-6666-4666-8666-666666666666',externalEventId:'vendor-event-1',eventType:'PLATE_READ',occurredAt:new Date('2026-09-17T12:00:00Z'),
      }]);

    await expect(service.ingestEvent(device.societyId,device.id,{
      externalEventId:'vendor-event-1',eventType:'PLATE_READ',occurredAt:'2026-09-17T12:00:00Z',payload:{plate:'TN01AB1234'},
    })).resolves.toEqual(expect.objectContaining({
      id:'66666666-6666-4666-8666-666666666666',idempotent:true,
    }));
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});
