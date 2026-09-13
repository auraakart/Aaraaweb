import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { EmergencyBroadcastController } from './emergency-broadcast.controller';
import { EmergencyBroadcastManageGuard } from './emergency-broadcast-manage.guard';
import { EmergencyBroadcastService } from './emergency-broadcast.service';
import { SosController } from './sos.controller';
import { SosService } from './sos.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [SosController, EmergencyBroadcastController],
  providers: [PrismaService, SosService, EmergencyBroadcastService, EmergencyBroadcastManageGuard],
  exports: [SosService, EmergencyBroadcastService],
})
export class SosModule {}
