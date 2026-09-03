import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Observable, Subject, startWith } from 'rxjs';
import { PushNotificationService } from './push-notification.service';
import { GateRecipientService } from './gate-recipient.service';

export type AccessRealtimeEvent = {
  type: 'ACCESS_APPROVAL_REQUESTED' | 'ACCESS_APPROVAL_DECIDED' | 'ACCESS_STATUS_CHANGED';
  societyId: string;
  unitId?: string;
  userId?: string;
  gateId?: string;
  requestId: string;
  subjectType: string;
  subjectName: string;
  status: string;
  createdAt: string;
};

export type ResidentMessageEvent = AccessRealtimeEvent | {
  type: 'MAINTENANCE_DUE_ISSUED' | 'GENERAL_NOTICE_PUBLISHED';
  societyId: string;
  userId: string;
  title: string;
  body: string;
  createdAt: string;
  invoiceId?: string;
  noticeId?: string;
};

@Injectable()
export class NotificationRealtimeService {
  private readonly logger = new Logger(NotificationRealtimeService.name);
  private readonly residentStreams = new Map<string, Subject<MessageEvent>>();
  private readonly societyGateStreams = new Map<string, Subject<MessageEvent>>();

  constructor(private readonly push: PushNotificationService, private readonly gateRecipients: GateRecipientService) {}

  residentStream(societyId: string, userId: string): Observable<MessageEvent> {
    const key = `${societyId}:${userId}`;
    let stream = this.residentStreams.get(key);
    if (!stream) {
      stream = new Subject<MessageEvent>();
      this.residentStreams.set(key, stream);
    }
    return stream.asObservable().pipe(startWith({ data: { type: 'CONNECTED' } }));
  }

  gateStream(societyId: string): Observable<MessageEvent> {
    let stream = this.societyGateStreams.get(societyId);
    if (!stream) {
      stream = new Subject<MessageEvent>();
      this.societyGateStreams.set(societyId, stream);
    }
    return stream.asObservable().pipe(startWith({ data: { type: 'CONNECTED' } }));
  }

  publishResident(event: ResidentMessageEvent) {
    if (!event.userId) return;
    this.residentStreams.get(`${event.societyId}:${event.userId}`)?.next({ data: event });
    void this.push.sendResidentEvent(event).catch((error: unknown) => {
      this.logger.warn(`Push delivery failed for resident event ${event.type}: ${error instanceof Error ? error.message : 'unknown error'}`);
    });
  }

  async publishUnitOccupants(event: AccessRealtimeEvent) {
    if (!event.unitId) return;
    const recipients = await this.gateRecipients.notificationRecipients(event.societyId, event.unitId);
    recipients.forEach(({ userId }) => this.publishResident({ ...event, userId }));
  }

  publishGateUpdate(event: AccessRealtimeEvent) {
    this.societyGateStreams.get(event.societyId)?.next({ data: event });
  }
}
