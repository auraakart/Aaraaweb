import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { NoticeSchedulingController } from './notice-scheduling.controller';
import { NoticeSchedulingService } from './notice-scheduling.service';
import { NoticeTargetingController } from './notice-targeting.controller';
import { NoticeTargetingService } from './notice-targeting.service';
import { NoticesController } from './notices.controller';
import { NoticesService } from './notices.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [NoticesController, NoticeSchedulingController, NoticeTargetingController],
  providers: [NoticesService, NoticeSchedulingService, NoticeTargetingService, PrismaService],
})
export class NoticesModule {}
