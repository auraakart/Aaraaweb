import { describe,expect,it } from 'vitest';
import { AccessDeviceKind } from './access-device.adapter';
import { SimulatorAccessDeviceAdapter } from './simulator-access-device.adapter';

const kinds:readonly AccessDeviceKind[]=['ANPR','BOOM_BARRIER','RFID'];

describe.each(kinds)('V4.7 %s simulator common contract',(kind)=>{
  it('reports health, executes idempotently and fails closed when offline',async()=>{
    const adapter=new SimulatorAccessDeviceAdapter(kind);
    await expect(adapter.health()).resolves.toEqual(expect.objectContaining({adapter:kind,health:'ONLINE'}));

    const first=await adapter.execute({idempotencyKey:`${kind}-contract-0001`,command:'PING'});
    const second=await adapter.execute({idempotencyKey:`${kind}-contract-0001`,command:'PING'});
    expect(first).toEqual(second);
    expect(first.accepted).toBe(true);

    adapter.setHealth('OFFLINE');
    await expect(adapter.execute({idempotencyKey:`${kind}-contract-0002`,command:'PING'})).resolves.toEqual(expect.objectContaining({
      adapter:kind,accepted:false,state:'DEVICE_OFFLINE',
    }));
  });
});
