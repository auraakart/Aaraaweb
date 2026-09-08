import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Observable, Subject, startWith } from 'rxjs';
import { PushNotificationService } from './push-notification.service';
import { GateRecipientService } from './gate-recipient.service';
import { PrismaService } from '../prisma/prisma.service';

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
  unitId?: string;
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

  constructor(
    private readonly push: PushNotificationService,
    private readonly gateRecipients: GateRecipientService,
    private readonly prisma?: PrismaService,
  ) {}

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
    if (event.type === 'MAINTENANCE_DUE_ISSUED' && !event.unitId && event.invoiceId && this.prisma) {
      void this.publishMaintenanceWithUnit(event);
      return;
    }
    this.deliverResident(event);
  }

  async publishUnitOccupants(event: AccessRealtimeEvent) {
    if (!event.unitId) return;
    const recipients = await this.gateRecipients.notificationRecipients(event.societyId, event.unitId);
    recipients.forEach(({ userId }) => this.publishResident({ ...event, userId }));
  }

  publishGateUpdate(event: AccessRealtimeEvent) {
    this.societyGateStreams.get(event.societyId)?.next({ data: event });
  }

  private async publishMaintenanceWithUnit(event: Extract<ResidentMessageEvent, { type: 'MAINTENANCE_DUE_ISSUED' | 'GENERAL_NOTICE_PUBLISHED' }>) {
    try {
      const invoice = await this.prisma?.maintenanceInvoice.findFirst({
        where: { id: event.invoiceId!, societyId: event.societyId },
        select: { unitId: true },
      });
      if (!invoice) {
        this.logger.warn(`Maintenance notification dropped because invoice ${event.invoiceId} was not found in society ${event.societyId}`);
        return;
      }
      this.deliverResident({ ...event, unitId: invoice.unitId });
    } catch (error) {
      this.logger.warn(`Maintenance notification enrichment failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  private deliverResident(event: ResidentMessageEvent) {
    this.residentStreams.get(`${event.societyId}:${event.userId}`)?.next({ data: event });
    void this.push.sendResidentEvent(event).catch((error: unknown) => {
      this.logger.warn(`Push delivery failed for resident event ${event.type}: ${error instanceof Error ? error.message : 'unknown error'}`);
    });
  }
}
