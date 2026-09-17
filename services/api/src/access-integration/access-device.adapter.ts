export type AccessDeviceKind='ANPR'|'BOOM_BARRIER'|'RFID';
export type AccessDeviceHealth='ONLINE'|'DEGRADED'|'OFFLINE';
export type AccessDeviceCommandType='PING'|'OPEN'|'CLOSE'|'READ';

export type AccessDeviceCommand={
  idempotencyKey:string;
  command:AccessDeviceCommandType;
  payload?:Record<string,unknown>;
};

export type AccessDeviceCommandResult={
  adapter:AccessDeviceKind;
  idempotencyKey:string;
  accepted:boolean;
  state:string;
  occurredAt:string;
  evidence?:Record<string,unknown>;
};

export type AccessDeviceStatus={
  adapter:AccessDeviceKind;
  health:AccessDeviceHealth;
  lastSeenAt:string;
  message?:string;
};

export interface AccessDeviceAdapter {
  readonly kind:AccessDeviceKind;
  health():Promise<AccessDeviceStatus>;
  execute(command:AccessDeviceCommand):Promise<AccessDeviceCommandResult>;
}
