import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { HelpdeskController } from './helpdesk.controller';
import { HelpdeskService } from './helpdesk.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [HelpdeskController],
  providers: [HelpdeskService, PrismaService],
})
export class HelpdeskModule {}
