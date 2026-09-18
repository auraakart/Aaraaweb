import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessDeviceCommand, AccessDeviceKind, AccessIntegrationCompatibilityContract } from './access-device.adapter';
import { SimulatorAccessDeviceAdapter } from './simulator-access-device.adapter';

const ADAPTER_KINDS:readonly AccessDeviceKind[]=['ANPR','BOOM_BARRIER','RFID'];

type DeviceRow={
  id:string;
  societyId:string;
  gateId:string;
  adapterKind:AccessDeviceKind;
  deviceKey:string;
  displayName:string;
  active:boolean;
  health:'ONLINE'|'DEGRADED'|'OFFLINE';
};

@Injectable()
export class AccessIntegrationService {
  private readonly adapters=new Map<string,SimulatorAccessDeviceAdapter>();
  private readonly compatibility:readonly AccessIntegrationCompatibilityContract[]=[
    {target:'BIOMETRIC',requiredCapabilities:['IDENTIFY_CREDENTIAL','HEALTH_CHECK'],transportOwnedByAdapter:true,directDatabaseAccessAllowed:false,commandsRequireIdempotency:true,eventsRequireExternalDeduplicationKey:true,manualFallbackRequired:true},
    {target:'SMART_LOCK',requiredCapabilities:['IDENTIFY_CREDENTIAL','READ_STATE','HEALTH_CHECK'],transportOwnedByAdapter:true,directDatabaseAccessAllowed:false,commandsRequireIdempotency:true,eventsRequireExternalDeduplicationKey:true,manualFallbackRequired:true},
    {target:'INTERCOM_CCTV',requiredCapabilities:['READ_STATE','HEALTH_CHECK'],transportOwnedByAdapter:true,directDatabaseAccessAllowed:false,commandsRequireIdempotency:true,eventsRequireExternalDeduplicationKey:true,manualFallbackRequired:true},
    {target:'LIFT_ACCESS',requiredCapabilities:['IDENTIFY_CREDENTIAL','READ_STATE','HEALTH_CHECK'],transportOwnedByAdapter:true,directDatabaseAccessAllowed:false,commandsRequireIdempotency:true,eventsRequireExternalDeduplicationKey:true,manualFallbackRequired:true},
    {target:'EV_GATEWAY',requiredCapabilities:['IDENTIFY_VEHICLE','READ_STATE','HEALTH_CHECK'],transportOwnedByAdapter:true,directDatabaseAccessAllowed:false,commandsRequireIdempotency:true,eventsRequireExternalDeduplicationKey:true,manualFallbackRequired:true},
  ];

  constructor(private readonly prisma?:PrismaService) {}

  compatibilityTargets(){ return this.compatibility; }

  async listAdapters(societyId:string){
    return Promise.all(ADAPTER_KINDS.map(async kind=>({kind,...await this.adapter(societyId,kind).health()})));
  }

  async health(societyId:string,kind:AccessDeviceKind){
    return this.adapter(societyId,kind).health();
  }

  async command(societyId:string,kind:AccessDeviceKind,input:AccessDeviceCommand){
    const key=this.key(input.idempotencyKey);
    return this.adapter(societyId,kind).execute({...input,idempotencyKey:key});
  }

  setSimulatorHealth(societyId:string,kind:AccessDeviceKind,health:'ONLINE'|'DEGRADED'|'OFFLINE'){
    this.adapter(societyId,kind).setHealth(health);
    return {kind,health};
  }

  listDevices(societyId:string){
    return this.db().$queryRaw(Prisma.sql`
      SELECT d.*,g."name" AS "gateName"
      FROM "AccessIntegrationDevice" d
      JOIN "Gate" g ON g."id"=d."gateId" AND g."societyId"=d."societyId"
      WHERE d."societyId"=${societyId}::uuid
      ORDER BY d."active" DESC,g."name",d."displayName"
    `);
  }

  async createDevice(societyId:string,actorUserId:string,input:{
    gateId:string; adapterKind:AccessDeviceKind; deviceKey:string; displayName:string; config?:Record<string,unknown>;
  }){
    const db=this.db();
    const gates=await db.$queryRaw<Array<{id:string}>>(Prisma.sql`
      SELECT "id" FROM "Gate" WHERE "id"=${input.gateId}::uuid AND "societyId"=${societyId}::uuid LIMIT 1
    `);
    if(!gates[0]) throw new NotFoundException('Gate not found in active society');
    const deviceKey=input.deviceKey.trim();
    const displayName=input.displayName.trim();
    if(!deviceKey||deviceKey.length>160) throw new BadRequestException('Device key must be between 1 and 160 characters');
    if(!displayName||displayName.length>160) throw new BadRequestException('Display name must be between 1 and 160 characters');
    try{
      const rows=await db.$queryRaw<DeviceRow[]>(Prisma.sql`
        INSERT INTO "AccessIntegrationDevice" (
          "societyId","gateId","adapterKind","deviceKey","displayName","config","createdByUserId"
        ) VALUES (
          ${societyId}::uuid,${input.gateId}::uuid,${input.adapterKind},${deviceKey},${displayName},
          ${JSON.stringify(input.config??{})}::jsonb,${actorUserId}::uuid
        ) RETURNING *
      `);
      return rows[0];
    }catch(error){
      if(this.isUniqueViolation(error)) throw new BadRequestException('Device key already exists in this society');
      throw error;
    }
  }

  async refreshDeviceHealth(societyId:string,deviceId:string){
    const db=this.db();
    const device=await this.device(societyId,deviceId);
    const status=await this.adapter(societyId,device.adapterKind).health();
    await db.$executeRaw(Prisma.sql`
      UPDATE "AccessIntegrationDevice"
      SET "health"=${status.health},"lastHealthAt"=CURRENT_TIMESTAMP,
          "lastSeenAt"=CASE WHEN ${status.health}='OFFLINE' THEN "lastSeenAt" ELSE CURRENT_TIMESTAMP END,
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${deviceId}::uuid AND "societyId"=${societyId}::uuid
    `);
    return {...status,deviceId};
  }

  async commandDevice(societyId:string,actorUserId:string,deviceId:string,input:AccessDeviceCommand){
    const db=this.db();
    const device=await this.device(societyId,deviceId);
    const idempotencyKey=this.key(input.idempotencyKey);
    const inserted=await db.$queryRaw<Array<{id:string;status:string;result:unknown}>>(Prisma.sql`
      INSERT INTO "AccessIntegrationCommand" (
        "societyId","deviceId","actorUserId","idempotencyKey","command","payload"
      ) VALUES (
        ${societyId}::uuid,${deviceId}::uuid,${actorUserId}::uuid,${idempotencyKey},${input.command},
        ${JSON.stringify(input.payload??{})}::jsonb
      )
      ON CONFLICT ("societyId","deviceId","idempotencyKey") DO NOTHING
      RETURNING "id","status","result"
    `);
    if(!inserted[0]){
      const existing=await db.$queryRaw<Array<{id:string;status:string;result:unknown;command:string;payload:unknown}>>(Prisma.sql`
        SELECT "id","status","result","command","payload" FROM "AccessIntegrationCommand"
        WHERE "societyId"=${societyId}::uuid AND "deviceId"=${deviceId}::uuid AND "idempotencyKey"=${idempotencyKey}
        LIMIT 1
      `);
      if(!existing[0]) throw new BadRequestException('Command idempotency state could not be resolved');
      if(existing[0].command!==input.command||JSON.stringify(existing[0].payload??{})!==JSON.stringify(input.payload??{})){
        throw new BadRequestException('Idempotency key was already used for a different access command');
      }
      return {...existing[0],deviceId,idempotent:true};
    }
    const result=await this.adapter(societyId,device.adapterKind).execute({...input,idempotencyKey});
    const status=result.accepted?'SUCCEEDED':'FAILED';
    await db.$executeRaw(Prisma.sql`
      UPDATE "AccessIntegrationCommand"
      SET "status"=${status},"result"=${JSON.stringify(result)}::jsonb,"completedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${inserted[0].id}::uuid AND "societyId"=${societyId}::uuid AND "status"='PENDING'
    `);
    await db.$executeRaw(Prisma.sql`
      UPDATE "AccessIntegrationDevice"
      SET "health"=${result.accepted?'ONLINE':'OFFLINE'},"lastHealthAt"=CURRENT_TIMESTAMP,
          "lastSeenAt"=CASE WHEN ${result.accepted} THEN CURRENT_TIMESTAMP ELSE "lastSeenAt" END,
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${deviceId}::uuid AND "societyId"=${societyId}::uuid
    `);
    return {
      id:inserted[0].id,deviceId,status,result,idempotent:false,
      manualFallback: result.accepted ? null : {available:true,path:'MANUAL_GATE_OPERATION',reason:result.state},
    };
  }

  async ingestEvent(societyId:string,deviceId:string,input:{externalEventId:string;eventType:string;payload?:Record<string,unknown>;occurredAt:string}){
    const db=this.db();
    await this.device(societyId,deviceId);
    const externalEventId=input.externalEventId.trim();
    const eventType=input.eventType.trim();
    const occurredAt=new Date(input.occurredAt);
    if(!externalEventId||externalEventId.length>200) throw new BadRequestException('External event id must be between 1 and 200 characters');
    if(!eventType||eventType.length>80) throw new BadRequestException('Event type must be between 1 and 80 characters');
    if(!Number.isFinite(occurredAt.getTime())) throw new BadRequestException('Invalid event timestamp');
    const inserted=await db.$queryRaw<Array<{id:string;externalEventId:string;eventType:string;occurredAt:Date}>>(Prisma.sql`
      INSERT INTO "AccessIntegrationEvent" (
        "societyId","deviceId","externalEventId","eventType","payload","occurredAt"
      ) VALUES (
        ${societyId}::uuid,${deviceId}::uuid,${externalEventId},${eventType},${JSON.stringify(input.payload??{})}::jsonb,${occurredAt}
      )
      ON CONFLICT ("societyId","deviceId","externalEventId") DO NOTHING
      RETURNING "id","externalEventId","eventType","occurredAt"
    `);
    if(inserted[0]){
      await db.$executeRaw(Prisma.sql`
        UPDATE "AccessIntegrationDevice" SET "lastSeenAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${deviceId}::uuid AND "societyId"=${societyId}::uuid
      `);
      return {...inserted[0],idempotent:false};
    }
    const existing=await db.$queryRaw<Array<{id:string;externalEventId:string;eventType:string;occurredAt:Date;payload:unknown}>>(Prisma.sql`
      SELECT "id","externalEventId","eventType","occurredAt","payload" FROM "AccessIntegrationEvent"
      WHERE "societyId"=${societyId}::uuid AND "deviceId"=${deviceId}::uuid AND "externalEventId"=${externalEventId}
      LIMIT 1
    `);
    if(!existing[0]) throw new BadRequestException('Event deduplication state could not be resolved');
    if(existing[0].eventType!==eventType||existing[0].occurredAt.toISOString()!==occurredAt.toISOString()||JSON.stringify(existing[0].payload??{})!==JSON.stringify(input.payload??{})){
      throw new BadRequestException('External event id was already used for different event evidence');
    }
    return {...existing[0],idempotent:true};
  }

  listCommands(societyId:string,deviceId:string){
    return this.device(societyId,deviceId).then(()=>this.db().$queryRaw(Prisma.sql`
      SELECT "id","deviceId","actorUserId","idempotencyKey","command","status","result","createdAt","completedAt"
      FROM "AccessIntegrationCommand"
      WHERE "societyId"=${societyId}::uuid AND "deviceId"=${deviceId}::uuid
      ORDER BY "createdAt" DESC,"id" DESC LIMIT 500
    `));
  }

  listEvents(societyId:string,deviceId:string){
    return this.device(societyId,deviceId).then(()=>this.db().$queryRaw(Prisma.sql`
      SELECT * FROM "AccessIntegrationEvent"
      WHERE "societyId"=${societyId}::uuid AND "deviceId"=${deviceId}::uuid
      ORDER BY "occurredAt" DESC,"receivedAt" DESC LIMIT 500
    `));
  }

  private async device(societyId:string,deviceId:string){
    const rows=await this.db().$queryRaw<DeviceRow[]>(Prisma.sql`
      SELECT "id","societyId","gateId","adapterKind","deviceKey","displayName","active","health"
      FROM "AccessIntegrationDevice"
      WHERE "id"=${deviceId}::uuid AND "societyId"=${societyId}::uuid AND "active"=TRUE LIMIT 1
    `);
    if(!rows[0]) throw new NotFoundException('Active access integration device not found');
    return rows[0];
  }

  private key(value:string){
    const key=value.trim();
    if(key.length<8||key.length>160) throw new BadRequestException('Idempotency key must be between 8 and 160 characters');
    return key;
  }

  private adapter(societyId:string,kind:AccessDeviceKind){
    if(!ADAPTER_KINDS.includes(kind)) throw new NotFoundException('Access device adapter not found');
    const key=`${societyId}:${kind}`;
    let adapter=this.adapters.get(key);
    if(!adapter){
      adapter=new SimulatorAccessDeviceAdapter(kind);
      this.adapters.set(key,adapter);
    }
    return adapter;
  }

  private db(){
    if(!this.prisma) throw new BadRequestException('Access integration persistence is unavailable');
    return this.prisma;
  }

  private isUniqueViolation(error:unknown){
    return typeof error==='object'&&error!==null&&'code' in error&&(error as {code?:unknown}).code==='23505';
  }
}
