import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationRealtimeService } from './notification-realtime.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationRealtimeService],
  exports: [NotificationRealtimeService],
})
export class NotificationsModule {}
