import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Observable, Subject, startWith } from 'rxjs';
import { PushNotificationService } from './push-notification.service';

export type AccessRealtimeEvent = {
  type: 'ACCESS_APPROVAL_REQUESTED' | 'ACCESS_APPROVAL_DECIDED' | 'ACCESS_STATUS_CHANGED';
  societyId: string;
  userId?: string;
  gateId?: string;
  requestId: string;
  subjectType: string;
  subjectName: string;
  status: string;
  createdAt: string;
};

@Injectable()
export class NotificationRealtimeService {
  private readonly logger = new Logger(NotificationRealtimeService.name);
  private readonly residentStreams = new Map<string, Subject<MessageEvent>>();
  private readonly societyGateStreams = new Map<string, Subject<MessageEvent>>();

  constructor(private readonly push: PushNotificationService) {}

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

  publishResident(event: AccessRealtimeEvent) {
    if (!event.userId) return;
    this.residentStreams.get(`${event.societyId}:${event.userId}`)?.next({ data: event });
    void this.push.sendResidentEvent(event).catch((error: unknown) => {
      this.logger.warn(`Push delivery failed for access request ${event.requestId}: ${error instanceof Error ? error.message : 'unknown error'}`);
    });
  }

  publishGateUpdate(event: AccessRealtimeEvent) {
    this.societyGateStreams.get(event.societyId)?.next({ data: event });
  }
}
