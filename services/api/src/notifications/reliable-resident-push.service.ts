import { Injectable } from '@nestjs/common';
import { App, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PrismaService } from '../prisma/prisma.service';
import type { ResidentMessageEvent } from './notification-realtime.service';
import { PushNotificationService } from './push-notification.service';

export type ResidentPushDeliveryResult = {
  sent: number;
  retryRegistrationIds: string[];
};

class FcmUnavailableError extends Error {
  readonly code = 'FCM_DISABLED';
  constructor() { super('Firebase Cloud Messaging is not configured'); }
}

@Injectable()
export class ReliableResidentPushService extends PushNotificationService {
  private readonly residentFirebaseApp?: App;

  constructor(private readonly residentPrisma: PrismaService) {
    super(residentPrisma);
    this.residentFirebaseApp = getApps().find((app) => app.name === 'aaraagate');
  }

  async sendResidentOutboxEvent(event: ResidentMessageEvent, onlyRegistrationIds?: string[]): Promise<ResidentPushDeliveryResult> {
    if (!event.userId) return { sent: 0, retryRegistrationIds: [] };
    if (!this.residentFirebaseApp) throw new FcmUnavailableError();

    const registrations = await this.residentPrisma.devicePushToken.findMany({
      where: {
        societyId: event.societyId,
        userId: event.userId,
        active: true,
        ...(onlyRegistrationIds ? { id: { in: onlyRegistrationIds } } : {}),
      },
      select: { id: true, token: true },
    });
    if (registrations.length === 0) return { sent: 0, retryRegistrationIds: [] };

    const content = this.content(event);
    const response = await getMessaging(this.residentFirebaseApp).sendEachForMulticast({
      tokens: registrations.map((item) => item.token),
      notification: { title: content.title, body: content.body },
      data: { type: event.type, societyId: event.societyId, ...content.data },
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default', contentAvailable: true } } },
    });

    const invalidIds: string[] = [];
    const retryRegistrationIds: string[] = [];
    response.responses.forEach((result, index) => {
      if (result.success) return;
      const registration = registrations[index];
      const code = result.error?.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
        invalidIds.push(registration.id);
        return;
      }
      retryRegistrationIds.push(registration.id);
    });

    if (invalidIds.length > 0) {
      await this.residentPrisma.devicePushToken.updateMany({
        where: { id: { in: invalidIds } },
        data: { active: false },
      });
    }

    return { sent: response.successCount, retryRegistrationIds };
  }

  private content(event: ResidentMessageEvent): { title: string; body: string; data: Record<string, string> } {
    switch (event.type) {
      case 'ACCESS_APPROVAL_REQUESTED':
      case 'ACCESS_APPROVAL_DECIDED':
      case 'ACCESS_STATUS_CHANGED':
        return {
          title: event.type === 'ACCESS_APPROVAL_REQUESTED' ? `${this.label(event.subjectType)} at the gate` : 'Gate access updated',
          body: event.type === 'ACCESS_APPROVAL_REQUESTED'
            ? `${event.subjectName} is waiting for your approval.`
            : `${event.subjectName}: ${event.status.replaceAll('_', ' ').toLowerCase()}`,
          data: {
            requestId: event.requestId,
            subjectType: event.subjectType,
            subjectName: event.subjectName,
            status: event.status,
            ...(event.gateId ? { gateId: event.gateId } : {}),
            ...(event.unitId ? { unitId: event.unitId } : {}),
          },
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
        return { title: event.title, body: event.body, data: { parcelId: event.parcelId, unitId: event.unitId } };
      case 'EMERGENCY_BROADCAST':
        return {
          title: event.title,
          body: event.body,
          data: { broadcastId: event.broadcastId, severity: event.severity, ...(event.incidentId ? { incidentId: event.incidentId } : {}) },
        };
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
