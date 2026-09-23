import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessRealtimeEvent } from './notification-realtime.service';

export type GateNotificationEvidence = {
  channel:'PUSH'|'IVR'|'MANUAL';
  status:'QUEUED'|'SIMULATED'|'REQUIRED';
  reason?:string;
  provider?:string;
  phoneSuffix?:string;
};

@Injectable()
export class GateNotificationFallbackService {
  constructor(private readonly prisma:PrismaService) {}

  async recordPushQueued(event:AccessRealtimeEvent,userId:string){
    return this.persist(event,userId,{channel:'PUSH',status:'QUEUED',provider:'firebase'});
  }

  async fallback(event:AccessRealtimeEvent,userId:string,reason:string):Promise<GateNotificationEvidence>{
    const user=await this.prisma.user.findUnique({where:{id:userId},select:{phone:true}});
    const phone=user?.phone?.trim();
    const configured=(process.env.GATE_IVR_PROVIDER??'').trim().toLowerCase();
    const provider=configured || ((process.env.NODE_ENV??'development')==='production'?'unconfigured':'simulator');
    const simulatorAllowed=provider==='simulator'&&(process.env.NODE_ENV??'development')!=='production';
    if(simulatorAllowed&&phone){
      const evidence:GateNotificationEvidence={
        channel:'IVR',status:'SIMULATED',reason,provider:'simulator',phoneSuffix:phone.slice(-4),
      };
      await this.persist(event,userId,evidence);
      return evidence;
    }
    const evidence:GateNotificationEvidence={
      channel:'MANUAL',status:'REQUIRED',
      reason:!phone?'NO_RESIDENT_PHONE':provider==='unconfigured'?'IVR_UNCONFIGURED':`IVR_PROVIDER_${provider.toUpperCase()}_NOT_WIRED`,
      provider,
    };
    await this.persist(event,userId,evidence);
    return evidence;
  }

  private async persist(event:AccessRealtimeEvent,userId:string,evidence:GateNotificationEvidence){
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "GateNotificationAttempt"
        ("societyId","requestId","userId","channel","status","reason","evidence")
      VALUES (
        ${event.societyId}::uuid,${event.requestId}::uuid,${userId}::uuid,
        ${evidence.channel},${evidence.status},${evidence.reason??null},
        ${JSON.stringify(evidence)}::jsonb
      )
      ON CONFLICT ("societyId","requestId","userId","channel")
      DO UPDATE SET "status"=EXCLUDED."status","reason"=EXCLUDED."reason",
        "evidence"=EXCLUDED."evidence","updatedAt"=CURRENT_TIMESTAMP
    `);
    return evidence;
  }
}
