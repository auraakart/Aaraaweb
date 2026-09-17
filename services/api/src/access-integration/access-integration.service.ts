import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessDeviceCommand, AccessDeviceKind } from './access-device.adapter';
import { SimulatorAccessDeviceAdapter } from './simulator-access-device.adapter';

@Injectable()
export class AccessIntegrationService {
  private readonly adapters=new Map<AccessDeviceKind,SimulatorAccessDeviceAdapter>([
    ['ANPR',new SimulatorAccessDeviceAdapter('ANPR')],
    ['BOOM_BARRIER',new SimulatorAccessDeviceAdapter('BOOM_BARRIER')],
    ['RFID',new SimulatorAccessDeviceAdapter('RFID')],
  ]);

  async listAdapters(){
    return Promise.all([...this.adapters.values()].map(async adapter=>({kind:adapter.kind,...await adapter.health()})));
  }

  async health(kind:AccessDeviceKind){
    return this.adapter(kind).health();
  }

  async command(kind:AccessDeviceKind,input:AccessDeviceCommand){
    const key=input.idempotencyKey.trim();
    if(key.length<8||key.length>160) throw new BadRequestException('Idempotency key must be between 8 and 160 characters');
    return this.adapter(kind).execute({...input,idempotencyKey:key});
  }

  setSimulatorHealth(kind:AccessDeviceKind,health:'ONLINE'|'DEGRADED'|'OFFLINE'){
    this.adapter(kind).setHealth(health);
    return {kind,health};
  }

  private adapter(kind:AccessDeviceKind){
    const adapter=this.adapters.get(kind);
    if(!adapter) throw new NotFoundException('Access device adapter not found');
    return adapter;
  }
}
