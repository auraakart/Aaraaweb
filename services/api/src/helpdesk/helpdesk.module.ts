import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { HelpdeskController } from './helpdesk.controller';
import { HelpdeskService } from './helpdesk.service';
import { HelpdeskSlaController } from './helpdesk-sla.controller';
import { HelpdeskSlaService } from './helpdesk-sla.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [HelpdeskController, HelpdeskSlaController],
  providers: [HelpdeskService, HelpdeskSlaService, PrismaService],
})
export class HelpdeskModule {}
