import { Injectable, Logger } from '@nestjs/common';
import { DevicePlatform } from '@prisma/client';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessRealtimeEvent } from './notification-realtime.service';

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

  async sendResidentEvent(event: AccessRealtimeEvent) {
    if (!this.firebaseApp || !event.userId) return;
    const registrations = await this.prisma.devicePushToken.findMany({
      where: { societyId: event.societyId, userId: event.userId, active: true },
      select: { id: true, token: true },
    });
    if (registrations.length === 0) return;

    const title = event.type === 'ACCESS_APPROVAL_REQUESTED'
      ? `${this.label(event.subjectType)} at the gate`
      : 'Gate access updated';
    const body = event.type === 'ACCESS_APPROVAL_REQUESTED'
      ? `${event.subjectName} is waiting for your approval.`
      : `${event.subjectName}: ${event.status.replaceAll('_', ' ').toLowerCase()}`;

    const response = await getMessaging(this.firebaseApp).sendEachForMulticast({
      tokens: registrations.map((item) => item.token),
      notification: { title, body },
      data: {
        type: event.type,
        requestId: event.requestId,
        subjectType: event.subjectType,
        subjectName: event.subjectName,
        status: event.status,
        societyId: event.societyId,
        ...(event.gateId ? { gateId: event.gateId } : {}),
      },
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default', contentAvailable: true } } },
    });

    const invalidIds: string[] = [];
    response.responses.forEach((result, index) => {
      if (result.success) return;
      const code = result.error?.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
        invalidIds.push(registrations[index].id);
      } else {
        this.logger.warn(`FCM delivery failed for access request ${event.requestId}: ${code ?? 'unknown error'}`);
      }
    });
    if (invalidIds.length > 0) {
      await this.prisma.devicePushToken.updateMany({ where: { id: { in: invalidIds } }, data: { active: false } });
    }
  }

  private label(subjectType: string) {
    switch (subjectType) {
      case 'DELIVERY': return 'Delivery';
      case 'CAB': return 'Cab';
      default: return 'Visitor';
    }
  }
}
