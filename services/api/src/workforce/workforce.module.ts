import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AccessModule } from '../access/access.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceController } from './workforce.controller';
import { WorkforceService } from './workforce.service';
import { WorkforceLeaveController } from './workforce-leave.controller';
import { WorkforceLeaveGateInterceptor } from './workforce-leave-gate.interceptor';
import { WorkforceLeaveService } from './workforce-leave.service';
import { WorkforceRatingController } from './workforce-rating.controller';
import { WorkforceRatingService } from './workforce-rating.service';
import { WorkforceSuspensionController } from './workforce-suspension.controller';
import { WorkforceSuspensionService } from './workforce-suspension.service';

@Module({
  imports: [EntitlementsModule, AccessModule, NotificationsModule],
  controllers: [
    WorkforceController,
    WorkforceLeaveController,
    WorkforceRatingController,
    WorkforceSuspensionController,
  ],
  providers: [
    PrismaService,
    WorkforceService,
    WorkforceLeaveService,
    WorkforceRatingService,
    WorkforceSuspensionService,
    { provide: APP_INTERCEPTOR, useClass: WorkforceLeaveGateInterceptor },
  ],
  exports: [WorkforceService, WorkforceLeaveService, WorkforceRatingService, WorkforceSuspensionService],
})
export class WorkforceModule {}
