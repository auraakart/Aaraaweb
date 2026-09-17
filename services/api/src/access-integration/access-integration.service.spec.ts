import { describe,expect,it } from 'vitest';
import { AccessIntegrationService } from './access-integration.service';

const SOCIETY_A='11111111-1111-4111-8111-111111111111';
const SOCIETY_B='22222222-2222-4222-8222-222222222222';

describe('AccessIntegrationService',()=>{
  it('registers ANPR, boom-barrier and RFID simulators per society',async()=>{
    const service=new AccessIntegrationService();
    const adapters=await service.listAdapters(SOCIETY_A);
    expect(adapters.map(item=>item.kind).sort()).toEqual(['ANPR','BOOM_BARRIER','RFID']);
    expect(adapters.every(item=>item.health==='ONLINE')).toBe(true);
  });

  it('returns the same result for a duplicate idempotency key within one society',async()=>{
    const service=new AccessIntegrationService();
    const first=await service.command(SOCIETY_A,'BOOM_BARRIER',{idempotencyKey:'command-0001',command:'OPEN'});
    const second=await service.command(SOCIETY_A,'BOOM_BARRIER',{idempotencyKey:'command-0001',command:'OPEN'});
    expect(first).toEqual(second);
    expect(first).toEqual(expect.objectContaining({accepted:true,state:'OPEN'}));
  });

  it('isolates simulator state between societies',async()=>{
    const service=new AccessIntegrationService();
    service.setSimulatorHealth(SOCIETY_A,'RFID','OFFLINE');

    await expect(service.health(SOCIETY_A,'RFID')).resolves.toEqual(expect.objectContaining({health:'OFFLINE'}));
    await expect(service.health(SOCIETY_B,'RFID')).resolves.toEqual(expect.objectContaining({health:'ONLINE'}));
    await expect(service.command(SOCIETY_A,'RFID',{idempotencyKey:'command-0002',command:'READ'})).resolves.toEqual(expect.objectContaining({
      accepted:false,state:'DEVICE_OFFLINE',adapter:'RFID',
    }));
    await expect(service.command(SOCIETY_B,'RFID',{idempotencyKey:'command-0002',command:'READ',payload:{tag:'TAG-123'}})).resolves.toEqual(expect.objectContaining({
      accepted:true,state:'TAG_READ',adapter:'RFID',
    }));
  });

  it('keeps ANPR and RFID read evidence distinct',async()=>{
    const service=new AccessIntegrationService();
    await expect(service.command(SOCIETY_A,'ANPR',{idempotencyKey:'command-0003',command:'READ',payload:{plate:'TN01AB1234'}})).resolves.toEqual(expect.objectContaining({state:'PLATE_READ'}));
    await expect(service.command(SOCIETY_A,'RFID',{idempotencyKey:'command-0004',command:'READ',payload:{tag:'TAG-123'}})).resolves.toEqual(expect.objectContaining({state:'TAG_READ'}));
  });
});
