import { Injectable, Logger } from '@nestjs/common';
import { DevicePlatform, Prisma } from '@prisma/client';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
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

  constructor(private readonly prisma: PrismaService, private readonly outbox?: PushDeliveryOutboxService) {
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
      this.logger.error('FCM disabled: FIREBASE_SERVICE_ACCOUNT_JSON is invalid', error instanceof Error ? error.stack : undefined);
    }
  }

  register(societyId: string, userId: string, token: string, platform: DevicePlatform, deviceId?: string) {
    const normalized = token.trim();
    return this.prisma.devicePushToken.upsert({
      where: { token: normalized },
      create: { societyId, userId, token: normalized, platform, deviceId: deviceId?.trim() || null, active: true, lastSeenAt: new Date() },
      update: { societyId, userId, platform, deviceId: deviceId?.trim() || null, active: true, lastSeenAt: new Date() },
    });
  }

  unregister(societyId: string, userId: string, token: string) {
    return this.prisma.devicePushToken.updateMany({ where: { societyId, userId, token: token.trim(), active: true }, data: { active: false, lastSeenAt: new Date() } });
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
      if (this.firebaseApp) await this.deliverResidentEvent(event);
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
    if (!queued || queued.status === 'DISPATCHED' || !this.firebaseApp) return;
    await this.outbox.attempt(queued.id, (work) => this.deliverOutbox(work));
  }

  drainDurableOutbox() {
    if (!this.firebaseApp || !this.outbox) {
      return Promise.resolve({ dispatched: 0, deferred: 0, failed: 0, claimed: 0 });
    }
    return this.outbox.drainDue((work) => this.deliverOutbox(work));
  }

  private deliverOutbox(work: PushOutboxEnvelope) {
    if (work.targetScope === 'RESIDENT') {
      return this.deliverResidentEvent(work.payload as unknown as ResidentMessageEvent);
    }
    return this.deliverConsumerBookingEvent(work.payload as unknown as ConsumerBookingPushEvent);
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
    if (!this.firebaseApp) throw new Error('FCM transport is unavailable');
    if (!event.userId) return;
    const registrations = await this.prisma.devicePushToken.findMany({ where: { societyId: event.societyId, userId: event.userId, active: true }, select: { id: true, token: true } });
    if (registrations.length === 0) return;
    const content = this.residentPushContent(event);
    const response = await getMessaging(this.firebaseApp).sendEachForMulticast({
      tokens: registrations.map((item) => item.token), notification: { title: content.title, body: content.body },
      data: { type: event.type, societyId: event.societyId, ...content.data }, android: { priority: 'high' }, apns: { payload: { aps: { sound: 'default', contentAvailable: true } } },
    });
    const invalidIds: string[] = [];
    let transientFailures = 0;
    response.responses.forEach((result, index) => {
      if (result.success) return;
      const code = result.error?.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') invalidIds.push(registrations[index].id);
      else {
        transientFailures += 1;
        this.logger.warn(`FCM delivery failed for resident event ${event.type}: ${code ?? 'unknown error'}`);
      }
    });
    if (invalidIds.length > 0) await this.prisma.devicePushToken.updateMany({ where: { id: { in: invalidIds } }, data: { active: false } });
    if (transientFailures > 0) throw new Error(`FCM resident delivery had ${transientFailures} transient failure(s)`);
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
