import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerNotificationsController } from './consumer-notifications.controller';
import { NotificationsController } from './notifications.controller';
import { NotificationRealtimeService } from './notification-realtime.service';
import { PushNotificationService } from './push-notification.service';
import { GateRecipientService } from './gate-recipient.service';
import { ReliableResidentPushService } from './reliable-resident-push.service';
import { ResidentPushOutboxService } from './resident-push-outbox.service';

@Global()
@Module({
  controllers: [NotificationsController, ConsumerNotificationsController],
  providers: [
    PrismaService,
    ReliableResidentPushService,
    { provide: PushNotificationService, useExisting: ReliableResidentPushService },
    ResidentPushOutboxService,
    GateRecipientService,
    NotificationRealtimeService,
  ],
  exports: [PushNotificationService, GateRecipientService, NotificationRealtimeService, ResidentPushOutboxService],
})
export class NotificationsModule {}
