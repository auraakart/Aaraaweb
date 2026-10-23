import { BrandingService } from '../branding/branding.service';
import { applicationPushRoutes, applicationPushProject, ApplicationPushRoute } from './application-push-routing';
import { assertApplicationSociety } from '../auth/partner-application-binding';
import { AppRole } from '../auth/auth.types';
import { Injectable, Logger, Optional, UnauthorizedException } from '@nestjs/common';
import { DevicePlatform, Prisma } from '@prisma/client';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { safeOperationalError } from '../observability/safe-operational-error';
import type { ResidentMessageEvent } from './notification-realtime.service';
import { PushDeliveryOutboxService, type PushOutboxEnvelope } from './push-delivery-outbox.service';

type ConsumerPushRegistration = { id: string; token: string };

type ConsumerBookingPushStatus = 'CONFIRMED' | 'CANCELLED' | 'ASSIGNED' | 'EN_ROUTE' | 'ARRIVED' | 'COMPLETION_REQUESTED';

export type ConsumerBookingPushEvent = {
  userId: string;
  bookingId: string;
  offeringName: string;
  providerName: string;
  agentDisplayName?: string | null;
  status: ConsumerBookingPushStatus;
};

export function consumerPushDedupeKey(event: ConsumerBookingPushEvent) {
  return `booking:${event.bookingId}:${event.status}:user:${event.userId}`;
}

export function residentPushDedupeKey(event: ResidentMessageEvent) {
  const userId = event.userId ?? 'unknown';
  switch (event.type) {
    case 'ACCESS_APPROVAL_REQUESTED':
    case 'ACCESS_APPROVAL_DECIDED':
    case 'ACCESS_STATUS_CHANGED':
      return `access:${event.requestId}:${event.type}:${event.status}:user:${userId}`;
    case 'MAINTENANCE_DUE_ISSUED':
      return `maintenance:${event.invoiceId ?? event.unitId ?? event.createdAt}:user:${userId}`;
    case 'GENERAL_NOTICE_PUBLISHED':
      return `notice:${event.noticeId ?? event.createdAt}:user:${userId}`;
    case 'PARCEL_RECEIVED':
      return `parcel:${event.parcelId}:user:${userId}`;
    case 'EMERGENCY_BROADCAST':
      return `emergency:${event.broadcastId}:user:${userId}`;
  }
}

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private readonly firebaseApp?: App;
  private applicationRoutes: ApplicationPushRoute[] = [];
  private readonly applicationApps = new Map<string,App>();
  private hasTransport() { return Boolean(this.firebaseApp || this.applicationApps.size); }

  constructor(private readonly prisma: PrismaService, private readonly outbox?: PushDeliveryOutboxService, @Optional() private readonly branding?: BrandingService) {
    try {
      this.applicationRoutes = applicationPushRoutes(process.env);
      for (const route of this.applicationRoutes) {
        const account = JSON.parse(process.env[route.credentialsEnv] ?? '{}') as { project_id:string; client_email:string; private_key:string };
        if(account.project_id !== route.projectId) throw new Error('Application credential project differs from registry');
        const name='aaraagate-application-'+route.applicationId;
        const app=getApps().find(item=>item.name===name) ?? initializeApp({projectId:route.projectId,credential:cert({projectId:account.project_id,clientEmail:account.client_email,privateKey:account.private_key})},name);
        if(app.options.projectId!==route.projectId)throw new Error('Application Firebase project mismatch');
        this.applicationApps.set(route.applicationId,app);
      }
    } catch { this.applicationRoutes=[];this.applicationApps.clear();this.logger.error('Application push routes unavailable'); }
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    if (!raw) {
      this.logger.log('FCM disabled: FIREBASE_SERVICE_ACCOUNT_JSON is not configured');
      return;
    }
    try {
      const serviceAccount = JSON.parse(raw) as { project_id: string; client_email: string; private_key: string };
      this.firebaseApp = getApps().find((app) => app.name === 'aaraagate') ?? initializeApp({
        credential: cert({ projectId: serviceAccount.project_id, clientEmail: serviceAccount.client_email, privateKey: serviceAccount.private_key }),
      }, 'aaraagate');
    } catch (error) {
      this.logger.error(`FCM disabled: FIREBASE_SERVICE_ACCOUNT_JSON is invalid (${safeOperationalError(error)})`);
    }
  }

  async register(societyId: string, userId: string, token: string, platform: DevicePlatform, deviceId?: string, applicationId?: string, roles: AppRole[] = []) {
    let routing: {applicationId:string;firebaseProjectId:string} | undefined;
    if(applicationId){
      await assertApplicationSociety(this.prisma,applicationId,societyId,roles,'OPERATE');
      const route=applicationPushProject(this.applicationRoutes,applicationId);
      if(!this.applicationApps.has(applicationId))throw new Error('Application push transport unavailable');
      routing={applicationId,firebaseProjectId:route.projectId};
    }
    const normalized = token.trim();
    return this.prisma.devicePushToken.upsert({
      where: { token: normalized },
      create: { societyId, userId, token: normalized, platform, deviceId: deviceId?.trim() || null, active: true, lastSeenAt: new Date(), ...(routing??{}) },
      update: { societyId, userId, platform, deviceId: deviceId?.trim() || null, active: true, lastSeenAt: new Date(), applicationId:routing?.applicationId??null,firebaseProjectId:routing?.firebaseProjectId??null },
    });
  }

  unregister(societyId: string, userId: string, token: string) {
    return this.prisma.devicePushToken.updateMany({ where: { societyId, userId, token: token.trim(), active: true }, data: { active: false, lastSeenAt: new Date() } });
  }

  async residentDeliveryReadiness(societyId:string,userId:string) {
    const activeDeviceCount=await this.prisma.devicePushToken.count({where:{societyId,userId,active:true}});
    return {transportConfigured:Boolean(this.firebaseApp),activeDeviceCount};
  }

  async registerConsumer(userId: string, token: string, platform: DevicePlatform, deviceId?: string) {
    const normalized = token.trim();

    await this.prisma.devicePushToken.updateMany({
      where: { token: normalized, active: true },
      data: { active: false, lastSeenAt: new Date() },
    });

    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "ConsumerPushDeviceToken" ("id", "userId", "token", "platform", "deviceId", "active", "lastSeenAt", "createdAt", "updatedAt")
      VALUES (${randomUUID()}::uuid, ${userId}::uuid, ${normalized}, ${platform}::"DevicePlatform", ${deviceId?.trim() || null}, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("token") DO UPDATE SET "userId" = EXCLUDED."userId", "platform" = EXCLUDED."platform", "deviceId" = EXCLUDED."deviceId", "active" = true, "lastSeenAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "id", "platform", "deviceId", "active", "lastSeenAt"
    `);
    return rows[0];
  }

  async unregisterConsumer(userId: string, token: string) {
    const count = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "ConsumerPushDeviceToken" SET "active" = false, "lastSeenAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId}::uuid AND "token" = ${token.trim()} AND "active" = true
    `);
    return { count };
  }

  async sendConsumerBookingEvent(event: ConsumerBookingPushEvent) {
    if (!this.outbox) {
      if (this.firebaseApp) await this.deliverConsumerBookingEvent(event);
      return;
    }
    const queued = await this.outbox.enqueue({
      targetScope: 'CONSUMER',
      societyId: null,
      userId: event.userId,
      eventType: 'CONSUMER_SERVICE_BOOKING_STATUS',
      dedupeKey: consumerPushDedupeKey(event),
      payload: event as unknown as Record<string, unknown>,
    });
    if (!queued || queued.status === 'DISPATCHED' || !this.firebaseApp) return;
    await this.outbox.attempt(queued.id, (work) => this.deliverOutbox(work));
  }

  async sendResidentEvent(event: ResidentMessageEvent) {
    if (!event.userId) return;
    // Scheduled notices already have recipient-level durable retry in NoticeDispatch.
    if (event.type === 'GENERAL_NOTICE_PUBLISHED' || !this.outbox) {
      if (this.hasTransport()) await this.deliverResidentEvent(event);
      return;
    }
    const queued = await this.outbox.enqueue({
      targetScope: 'RESIDENT',
      societyId: event.societyId,
      userId: event.userId,
      eventType: event.type,
      dedupeKey: residentPushDedupeKey(event),
      payload: event as unknown as Record<string, unknown>,
    });
    if (!queued || queued.status === 'DISPATCHED' || !this.hasTransport()) return;
    await this.outbox.attempt(queued.id, (work) => this.deliverOutbox(work));
  }

  drainDurableOutbox() {
    if (!this.hasTransport() || !this.outbox) {
      return Promise.resolve({ dispatched: 0, deferred: 0, failed: 0, claimed: 0 });
    }
    return this.outbox.drainDue((work) => this.deliverOutbox(work));
  }

  private async deliverOutbox(work: PushOutboxEnvelope) {
    const payload = work.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || !work.userId || typeof payload.userId !== 'string'
      || payload.userId.toLowerCase() !== work.userId.toLowerCase()) {
      throw new Error('Push outbox recipient metadata mismatch');
    }
    if (work.targetScope === 'RESIDENT') {
      if (!work.societyId || typeof payload.societyId !== 'string'
        || payload.societyId.toLowerCase() !== work.societyId.toLowerCase() || payload.type !== work.eventType) {
        throw new Error('Push outbox resident routing metadata mismatch');
      }
      return this.deliverResidentEvent(payload as unknown as ResidentMessageEvent);
    }
    if (work.targetScope !== 'CONSUMER' || work.societyId !== null
      || work.eventType !== 'CONSUMER_SERVICE_BOOKING_STATUS') {
      throw new Error('Push outbox consumer routing metadata mismatch');
    }
    return this.deliverConsumerBookingEvent(payload as unknown as ConsumerBookingPushEvent);
  }

  private async deliverConsumerBookingEvent(event: ConsumerBookingPushEvent) {
    if (!this.firebaseApp) throw new Error('FCM transport is unavailable');
    const registrations = await this.prisma.$queryRaw<ConsumerPushRegistration[]>(Prisma.sql`
      SELECT "id", "token" FROM "ConsumerPushDeviceToken" WHERE "userId" = ${event.userId}::uuid AND "active" = true
    `);
    if (registrations.length === 0) return;
    const content = this.consumerBookingContent(event);
    const response = await getMessaging(this.firebaseApp).sendEachForMulticast({
      tokens: registrations.map((item) => item.token),
      notification: { title: content.title, body: content.body },
      data: { type: 'CONSUMER_SERVICE_BOOKING_STATUS', bookingId: event.bookingId, status: event.status },
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default', contentAvailable: true } } },
    });
    const invalidIds: string[] = [];
    let transientFailures = 0;
    response.responses.forEach((result, index) => {
      if (result.success) return;
      const code = result.error?.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') invalidIds.push(registrations[index].id);
      else {
        transientFailures += 1;
        this.logger.warn(`FCM delivery failed for consumer booking ${event.bookingId}: ${code ?? 'unknown error'}`);
      }
    });
    if (invalidIds.length > 0) {
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "ConsumerPushDeviceToken" SET "active" = false, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" IN (${Prisma.join(invalidIds.map((id) => Prisma.sql`${id}::uuid`))})
      `);
    }
    if (transientFailures > 0) throw new Error(`FCM consumer delivery had ${transientFailures} transient failure(s)`);
  }

  private async deliverResidentEvent(event: ResidentMessageEvent) {
    if (!this.hasTransport()) throw new Error('FCM transport is unavailable');
    if (!event.userId) return;
    const registrations = await this.prisma.devicePushToken.findMany({ where: { societyId: event.societyId, userId: event.userId, active: true }, select: { id: true, token: true, applicationId:true, firebaseProjectId:true } });
    const content = this.residentPushContent(event);
    const groups=new Map<App,typeof registrations>();
    let routingFailures=0;
    const brandedApps=new Set<App>();
    for(const registration of registrations){
      let app=this.firebaseApp;
      if(registration.applicationId){
       try {
        const route=applicationPushProject(this.applicationRoutes,registration.applicationId,registration.firebaseProjectId);
        const memberships=await this.prisma.societyMembership.findMany({where:{societyId:event.societyId,userId:event.userId,active:true,user:{is:{status:'ACTIVE'}}},select:{role:true}});
        await assertApplicationSociety(this.prisma,route.applicationId,event.societyId,memberships.map(m=>m.role as AppRole),'OPERATE');
        app=this.applicationApps.get(route.applicationId);
        if(app)brandedApps.add(app);
       }catch(error){
        if(error instanceof UnauthorizedException)await this.prisma.devicePushToken.updateMany({where:{id:registration.id},data:{active:false}});
        else routingFailures++;
        continue;
       }
      }
      if(!app){routingFailures++;continue;}
      const group=groups.get(app)??[];group.push(registration);groups.set(app,group);
    }
    let transientFailures=0;
    for(const [app,group] of groups){
      let title=content.title;
      if(brandedApps.has(app)&&this.branding){
        try{const context=await this.branding.context({userId:event.userId,societyId:event.societyId,roles:[]});title=context.branding.brand.displayName+' · '+title;}
        catch{routingFailures++;continue;}
      }
      // FCM multicast supports at most 500 registrations per request.
      for(let start=0;start<group.length;start+=500){
        const batch=group.slice(start,start+500);
        const response=await getMessaging(app).sendEachForMulticast({
          tokens:batch.map(item=>item.token),notification:{title,body:content.body},
          data:{type:event.type,societyId:event.societyId,...content.data},android:{priority:'high'},apns:{payload:{aps:{sound:'default',contentAvailable:true}}},
        });
        const invalidIds:string[]=[];
        response.responses.forEach((result,index)=>{
          if(result.success)return;
          const code=result.error?.code;
          if(code==='messaging/registration-token-not-registered'||code==='messaging/invalid-registration-token')invalidIds.push(batch[index].id);
          else transientFailures++;
        });
        if(invalidIds.length)await this.prisma.devicePushToken.updateMany({where:{id:{in:invalidIds}},data:{active:false}});
      }
    }
    if(transientFailures+routingFailures>0)throw new Error(`FCM resident delivery had ${transientFailures} transient and ${routingFailures} routing failure(s)`);
  }

  private residentPushContent(event: ResidentMessageEvent): { title: string; body: string; data: Record<string, string> } {
    switch (event.type) {
      case 'ACCESS_APPROVAL_REQUESTED':
      case 'ACCESS_APPROVAL_DECIDED':
      case 'ACCESS_STATUS_CHANGED':
        return {
          title: event.type === 'ACCESS_APPROVAL_REQUESTED' ? `${this.label(event.subjectType)} at the gate` : 'Gate access updated',
          body: event.type === 'ACCESS_APPROVAL_REQUESTED' ? `${event.subjectName} is waiting for your approval.` : `${event.subjectName}: ${event.status.replaceAll('_', ' ').toLowerCase()}`,
          data: { requestId: event.requestId, subjectType: event.subjectType, subjectName: event.subjectName, status: event.status, ...(event.gateId ? { gateId: event.gateId } : {}), ...(event.unitId ? { unitId: event.unitId } : {}) },
        };
      case 'MAINTENANCE_DUE_ISSUED':
        return {
          title: event.title,
          body: event.body,
          data: { ...(event.invoiceId ? { invoiceId: event.invoiceId } : {}), ...(event.unitId ? { unitId: event.unitId } : {}) },
        };
      case 'GENERAL_NOTICE_PUBLISHED':
        return {
          title: event.title,
          body: event.body,
          data: { ...(event.noticeId ? { noticeId: event.noticeId } : {}), ...(event.unitId ? { unitId: event.unitId } : {}) },
        };
      case 'PARCEL_RECEIVED':
        return {
          title: event.title,
          body: event.body,
          data: { parcelId: event.parcelId, unitId: event.unitId },
        };
      case 'EMERGENCY_BROADCAST':
        return {
          title: event.title,
          body: event.body,
          data: {
            broadcastId: event.broadcastId,
            severity: event.severity,
            ...(event.incidentId ? { incidentId: event.incidentId } : {}),
          },
        };
    }
  }

  private consumerBookingContent(event: ConsumerBookingPushEvent) {
    switch (event.status) {
      case 'CONFIRMED': return { title: 'Service booking confirmed', body: `${event.providerName} confirmed ${event.offeringName}.` };
      case 'CANCELLED': return { title: 'Service booking cancelled', body: `${event.offeringName} was cancelled.` };
      case 'ASSIGNED': return { title: 'Service professional assigned', body: `${event.agentDisplayName || event.providerName} has been assigned to ${event.offeringName}.` };
      case 'EN_ROUTE': return { title: 'Service professional on the way', body: `${event.agentDisplayName || 'Your service professional'} is on the way.` };
      case 'ARRIVED': return { title: 'Service professional arrived', body: `${event.agentDisplayName || 'Your service professional'} has arrived.` };
      case 'COMPLETION_REQUESTED': return { title: 'Confirm service completion', body: `${event.agentDisplayName || event.providerName} marked ${event.offeringName} as finished. Please review and confirm.` };
    }
  }

  private label(subjectType: string) {
    switch (subjectType) { case 'DELIVERY': return 'Delivery'; case 'CAB': return 'Cab'; default: return 'Visitor'; }
  }
}
