import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { EmergencyBroadcastController } from './emergency-broadcast.controller';
import { EmergencyBroadcastManageGuard } from './emergency-broadcast-manage.guard';
import { EmergencyBroadcastService } from './emergency-broadcast.service';
import { SosFallbackController } from './sos-fallback.controller';
import { SosFallbackService } from './sos-fallback.service';
import { SosController } from './sos.controller';
import { SosService } from './sos.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [SosController, EmergencyBroadcastController, SosFallbackController],
  providers: [
    PrismaService,
    SosService,
    SosFallbackService,
    EmergencyBroadcastService,
    EmergencyBroadcastManageGuard,
  ],
  exports: [SosService, SosFallbackService, EmergencyBroadcastService],
})
export class SosModule {}
