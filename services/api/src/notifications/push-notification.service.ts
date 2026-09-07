import { Injectable, Logger } from '@nestjs/common';
import { DevicePlatform, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PrismaService } from '../prisma/prisma.service';
import type { ResidentMessageEvent } from './notification-realtime.service';

export type ConsumerServicePushEvent = {
  type: string;
  bookingId: string;
  title: string;
  body: string;
  status?: string;
  assignmentId?: string;
};

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private readonly firebaseApp?: App;

  constructor(private readonly prisma: PrismaService) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    if (!raw) {
      this.logger.log('FCM disabled: FIREBASE_SERVICE_ACCOUNT_JSON is not configured');
      return;
    }
    try {
      const serviceAccount = JSON.parse(raw) as {
        project_id: string;
        client_email: string;
        private_key: string;
      };
      this.firebaseApp = getApps().find((app) => app.name === 'aaraagate') ?? initializeApp({
        credential: cert({
          projectId: serviceAccount.project_id,
          clientEmail: serviceAccount.client_email,
          privateKey: serviceAccount.private_key,
        }),
      }, 'aaraagate');
    } catch (error) {
      this.logger.error('FCM disabled: FIREBASE_SERVICE_ACCOUNT_JSON is invalid', error instanceof Error ? error.stack : undefined);
    }
  }

  register(societyId: string, userId: string, token: string, platform: DevicePlatform, deviceId?: string) {
    const normalized = token.trim();
    return this.prisma.devicePushToken.upsert({
      where: { token: normalized },
      create: {
        societyId,
        userId,
        token: normalized,
        platform,
        deviceId: deviceId?.trim() || null,
        active: true,
        lastSeenAt: new Date(),
      },
      update: {
        societyId,
        userId,
        platform,
        deviceId: deviceId?.trim() || null,
        active: true,
        lastSeenAt: new Date(),
      },
    });
  }

  unregister(societyId: string, userId: string, token: string) {
    return this.prisma.devicePushToken.updateMany({
      where: { societyId, userId, token: token.trim(), active: true },
      data: { active: false, lastSeenAt: new Date() },
    });
  }

  async registerConsumer(userId: string, token: string, platform: DevicePlatform, deviceId?: string) {
    const normalized = token.trim();
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "ConsumerPushToken" (
        "id", "userId", "token", "platform", "deviceId", "active", "lastSeenAt", "createdAt", "updatedAt"
      ) VALUES (
        ${randomUUID()}::uuid,
        ${userId}::uuid,
        ${normalized},
        ${platform}::"DevicePlatform",
        ${deviceId?.trim() || null},
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("token") DO UPDATE SET
        "userId" = EXCLUDED."userId",
        "platform" = EXCLUDED."platform",
        "deviceId" = EXCLUDED."deviceId",
        "active" = true,
        "lastSeenAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING *
    `);
    return rows[0];
  }

  async unregisterConsumer(userId: string, token: string) {
    return this.prisma.$executeRaw(Prisma.sql`
      UPDATE "ConsumerPushToken"
      SET "active" = false, "lastSeenAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId}::uuid AND "token" = ${token.trim()} AND "active" = true
    `);
  }

  async sendConsumerServiceEvent(userId: string, event: ConsumerServicePushEvent) {
    if (!this.firebaseApp) return;
    const registrations = await this.prisma.$queryRaw<Array<{ id: string; token: string }>>(Prisma.sql`
      SELECT "id", "token"
      FROM "ConsumerPushToken"
      WHERE "userId" = ${userId}::uuid AND "active" = true
      ORDER BY "lastSeenAt" DESC
    `);
    if (registrations.length === 0) return;

    const response = await getMessaging(this.firebaseApp).sendEachForMulticast({
      tokens: registrations.map((item) => item.token),
      notification: { title: event.title, body: event.body },
      data: {
        type: event.type,
        bookingId: event.bookingId,
        ...(event.status ? { status: event.status } : {}),
        ...(event.assignmentId ? { assignmentId: event.assignmentId } : {}),
      },
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default', contentAvailable: true } } },
    });

    const invalidIds = this.collectInvalidRegistrationIds(registrations, response.responses, event.type);
    if (invalidIds.length > 0) {
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "ConsumerPushToken"
        SET "active" = false, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" IN (${Prisma.join(invalidIds.map((id) => Prisma.sql`${id}::uuid`))})
      `);
    }
  }

  async sendResidentEvent(event: ResidentMessageEvent) {
    if (!this.firebaseApp || !event.userId) return;
    const registrations = await this.prisma.devicePushToken.findMany({
      where: { societyId: event.societyId, userId: event.userId, active: true },
      select: { id: true, token: true },
    });
    if (registrations.length === 0) return;

    const content = 'requestId' in event ? {
      title: event.type === 'ACCESS_APPROVAL_REQUESTED' ? `${this.label(event.subjectType)} at the gate` : 'Gate access updated',
      body: event.type === 'ACCESS_APPROVAL_REQUESTED' ? `${event.subjectName} is waiting for your approval.` : `${event.subjectName}: ${event.status.replaceAll('_', ' ').toLowerCase()}`,
      data: {
        requestId: event.requestId,
        subjectType: event.subjectType,
        subjectName: event.subjectName,
        status: event.status,
        ...(event.gateId ? { gateId: event.gateId } : {}),
      },
    } : {
      title: event.title,
      body: event.body,
      data: {
        ...(event.invoiceId ? { invoiceId: event.invoiceId } : {}),
        ...(event.noticeId ? { noticeId: event.noticeId } : {}),
      },
    };

    const response = await getMessaging(this.firebaseApp).sendEachForMulticast({
      tokens: registrations.map((item) => item.token),
      notification: { title: content.title, body: content.body },
      data: {
        type: event.type,
        societyId: event.societyId,
        ...content.data,
      },
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default', contentAvailable: true } } },
    });

    const invalidIds = this.collectInvalidRegistrationIds(registrations, response.responses, event.type);
    if (invalidIds.length > 0) {
      await this.prisma.devicePushToken.updateMany({ where: { id: { in: invalidIds } }, data: { active: false } });
    }
  }

  private collectInvalidRegistrationIds(
    registrations: Array<{ id: string; token: string }>,
    responses: Array<{ success: boolean; error?: { code?: string } }>,
    eventType: string,
  ) {
    const invalidIds: string[] = [];
    responses.forEach((result, index) => {
      if (result.success) return;
      const code = result.error?.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
        invalidIds.push(registrations[index].id);
      } else {
        this.logger.warn(`FCM delivery failed for ${eventType}: ${code ?? 'unknown error'}`);
      }
    });
    return invalidIds;
  }

  private label(subjectType: string) {
    switch (subjectType) {
      case 'DELIVERY': return 'Delivery';
      case 'CAB': return 'Cab';
      default: return 'Visitor';
    }
  }
}
