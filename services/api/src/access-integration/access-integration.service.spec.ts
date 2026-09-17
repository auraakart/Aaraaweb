import { describe,expect,it } from 'vitest';
import { AccessIntegrationService } from './access-integration.service';

describe('AccessIntegrationService',()=>{
  it('registers ANPR, boom-barrier and RFID simulators',async()=>{
    const service=new AccessIntegrationService();
    const adapters=await service.listAdapters();
    expect(adapters.map(item=>item.kind).sort()).toEqual(['ANPR','BOOM_BARRIER','RFID']);
    expect(adapters.every(item=>item.health==='ONLINE')).toBe(true);
  });

  it('returns the same result for a duplicate idempotency key',async()=>{
    const service=new AccessIntegrationService();
    const first=await service.command('BOOM_BARRIER',{idempotencyKey:'command-0001',command:'OPEN'});
    const second=await service.command('BOOM_BARRIER',{idempotencyKey:'command-0001',command:'OPEN'});
    expect(first).toEqual(second);
    expect(first).toEqual(expect.objectContaining({accepted:true,state:'OPEN'}));
  });

  it('fails closed when a simulated device is offline without throwing into manual gate operations',async()=>{
    const service=new AccessIntegrationService();
    service.setSimulatorHealth('RFID','OFFLINE');
    await expect(service.command('RFID',{idempotencyKey:'command-0002',command:'READ'})).resolves.toEqual(expect.objectContaining({
      accepted:false,state:'DEVICE_OFFLINE',adapter:'RFID',
    }));
    await expect(service.health('RFID')).resolves.toEqual(expect.objectContaining({health:'OFFLINE'}));
  });

  it('keeps ANPR and RFID read evidence distinct',async()=>{
    const service=new AccessIntegrationService();
    await expect(service.command('ANPR',{idempotencyKey:'command-0003',command:'READ',payload:{plate:'TN01AB1234'}})).resolves.toEqual(expect.objectContaining({state:'PLATE_READ'}));
    await expect(service.command('RFID',{idempotencyKey:'command-0004',command:'READ',payload:{tag:'TAG-123'}})).resolves.toEqual(expect.objectContaining({state:'TAG_READ'}));
  });
});
