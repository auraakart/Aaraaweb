import { HelpdeskPhotosController } from './helpdesk-photos.controller';
import { HelpdeskPhotosService } from './helpdesk-photos.service';
import { PrivateObjectStorageModule } from '../storage/private-object-storage.module';
import { PrivateFileSafetyModule } from '../storage/private-file-safety.module';
import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { HelpdeskController } from './helpdesk.controller';
import { HelpdeskService } from './helpdesk.service';
import { HelpdeskSlaController } from './helpdesk-sla.controller';
import { HelpdeskSlaService } from './helpdesk-sla.service';

@Module({
  imports: [EntitlementsModule, PrivateObjectStorageModule, PrivateFileSafetyModule],
  controllers: [HelpdeskPhotosController, HelpdeskController, HelpdeskSlaController],
  providers: [HelpdeskPhotosService, HelpdeskService, HelpdeskSlaService, PrismaService],
  exports: [HelpdeskService],
})
export class HelpdeskModule {}
