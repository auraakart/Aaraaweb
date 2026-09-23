import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerNotificationsController } from './consumer-notifications.controller';
import { GateRecipientService } from './gate-recipient.service';
import { GateNotificationFallbackService } from './gate-notification-fallback.service';
import { NotificationRealtimeService } from './notification-realtime.service';
import { NotificationsController } from './notifications.controller';
import { PushNotificationService } from './push-notification.service';
import { PushDeliveryOutboxService } from './push-delivery-outbox.service';
import { SimulatorWhatsAppProvider } from './simulator-whatsapp.provider';
import { WhatsAppNotificationService } from './whatsapp-notification.service';
import { WHATSAPP_PROVIDER } from './whatsapp.provider';

@Global()
@Module({
  controllers: [NotificationsController, ConsumerNotificationsController],
  providers: [
    PrismaService,
    PushDeliveryOutboxService,
    PushNotificationService,
    GateRecipientService,
    GateNotificationFallbackService,
    NotificationRealtimeService,
    SimulatorWhatsAppProvider,
    { provide: WHATSAPP_PROVIDER, useExisting: SimulatorWhatsAppProvider },
    WhatsAppNotificationService,
  ],
  exports: [
    PushNotificationService,
    GateRecipientService,
    GateNotificationFallbackService,
    NotificationRealtimeService,
    WhatsAppNotificationService,
  ],
})
export class NotificationsModule {}
