import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsController } from './notifications.controller';
import { NotificationRealtimeService } from './notification-realtime.service';
import { PushNotificationService } from './push-notification.service';
import { GateRecipientService } from './gate-recipient.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [PrismaService, PushNotificationService, GateRecipientService, NotificationRealtimeService],
  exports: [PushNotificationService, GateRecipientService, NotificationRealtimeService],
})
export class NotificationsModule {}
