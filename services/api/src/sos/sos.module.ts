import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { EmergencyBroadcastController } from './emergency-broadcast.controller';
import { EmergencyBroadcastManageGuard } from './emergency-broadcast-manage.guard';
import { EmergencyBroadcastService } from './emergency-broadcast.service';
import { SosFallbackController } from './sos-fallback.controller';
import { SosFallbackService } from './sos-fallback.service';
import { SosRespondersController } from './sos-responders.controller';
import { SosRoutingController } from './sos-routing.controller';
import { SosRoutingService } from './sos-routing.service';
import { SosController } from './sos.controller';
import { SosService } from './sos.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [
    SosController,
    SosRespondersController,
    SosRoutingController,
    EmergencyBroadcastController,
    SosFallbackController,
  ],
  providers: [
    PrismaService,
    SosService,
    SosRoutingService,
    SosFallbackService,
    EmergencyBroadcastService,
    EmergencyBroadcastManageGuard,
  ],
  exports: [SosService, SosRoutingService, SosFallbackService, EmergencyBroadcastService],
})
export class SosModule {}
