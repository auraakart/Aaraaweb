import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsController } from './notifications.controller';
import { NotificationRealtimeService } from './notification-realtime.service';
import { PushNotificationService } from './push-notification.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [PrismaService, PushNotificationService, NotificationRealtimeService],
  exports: [PushNotificationService, NotificationRealtimeService],
})
export class NotificationsModule {}
