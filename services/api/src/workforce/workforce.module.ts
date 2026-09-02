import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceController } from './workforce.controller';
import { WorkforceService } from './workforce.service';

@Module({
  imports: [EntitlementsModule, AccessModule, NotificationsModule],
  controllers: [WorkforceController],
  providers: [PrismaService, WorkforceService],
  exports: [WorkforceService],
})
export class WorkforceModule {}
