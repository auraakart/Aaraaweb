import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OccupancyLifecycleService } from './occupancy-lifecycle.service';

@Injectable()
export class OccupancyLifecycleRunner implements OnModuleInit,OnModuleDestroy{
  private readonly logger=new Logger(OccupancyLifecycleRunner.name);
  private readonly intervalMs=Math.max(60_000,Number(process.env.OCCUPANCY_LIFECYCLE_INTERVAL_MS??300_000));
  private timer?:NodeJS.Timeout;
  private running=false;
  constructor(private readonly lifecycle:OccupancyLifecycleService){}
  onModuleInit(){if((process.env.OCCUPANCY_LIFECYCLE_AUTO_EXECUTE??'true').toLowerCase()==='false'){this.logger.log('Occupancy lifecycle auto execution disabled');return;}this.timer=setInterval(()=>void this.runOnce(),this.intervalMs);this.timer.unref();void this.runOnce();}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
  async runOnce(){if(this.running)return;this.running=true;try{const due=await this.lifecycle.dueApproved(50);for(const request of due){if(!request.reviewedByUserId){this.logger.warn(`Approved occupancy request ${request.id} has no reviewer; skipping`);continue;}try{await this.lifecycle.complete(request.societyId,request.reviewedByUserId,request.id,true);}catch(error){const message=error instanceof Error?error.message:String(error);if(!message.includes('checklist is incomplete'))this.logger.error(`Could not auto-complete occupancy request ${request.id}: ${message}`);}}}finally{this.running=false;}}
}
