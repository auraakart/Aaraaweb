import { AccessDeviceAdapter, AccessDeviceCommand, AccessDeviceCommandResult, AccessDeviceKind, AccessDeviceStatus } from './access-device.adapter';

export class SimulatorAccessDeviceAdapter implements AccessDeviceAdapter {
  private readonly receipts=new Map<string,AccessDeviceCommandResult>();
  private simulatedHealth:'ONLINE'|'DEGRADED'|'OFFLINE'='ONLINE';

  constructor(public readonly kind:AccessDeviceKind) {}

  setHealth(health:'ONLINE'|'DEGRADED'|'OFFLINE'){
    this.simulatedHealth=health;
  }

  async health():Promise<AccessDeviceStatus>{
    return {
      adapter:this.kind,
      health:this.simulatedHealth,
      lastSeenAt:new Date().toISOString(),
      message:this.simulatedHealth==='ONLINE'?'Simulator available':'Simulator health override',
    };
  }

  async execute(command:AccessDeviceCommand):Promise<AccessDeviceCommandResult>{
    const existing=this.receipts.get(command.idempotencyKey);
    if(existing) return existing;
    if(this.simulatedHealth==='OFFLINE'){
      const failed:AccessDeviceCommandResult={
        adapter:this.kind,idempotencyKey:command.idempotencyKey,accepted:false,state:'DEVICE_OFFLINE',occurredAt:new Date().toISOString(),
      };
      this.receipts.set(command.idempotencyKey,failed);
      return failed;
    }
    const state=this.stateFor(command.command);
    const result:AccessDeviceCommandResult={
      adapter:this.kind,
      idempotencyKey:command.idempotencyKey,
      accepted:true,
      state,
      occurredAt:new Date().toISOString(),
      evidence:{simulated:true,command:command.command,...(command.payload??{})},
    };
    this.receipts.set(command.idempotencyKey,result);
    return result;
  }

  private stateFor(command:AccessDeviceCommand['command']){
    if(command==='OPEN') return this.kind==='BOOM_BARRIER'?'OPEN':'COMMAND_ACCEPTED';
    if(command==='CLOSE') return this.kind==='BOOM_BARRIER'?'CLOSED':'COMMAND_ACCEPTED';
    if(command==='READ') return this.kind==='ANPR'?'PLATE_READ':this.kind==='RFID'?'TAG_READ':'STATE_READ';
    return 'ONLINE';
  }
}
