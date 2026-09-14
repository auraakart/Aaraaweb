import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { NoticeAttachmentsController } from './notice-attachments.controller';
import { NoticeAttachmentsService } from './notice-attachments.service';
import { NoticeSchedulingController } from './notice-scheduling.controller';
import { NoticeSchedulingService } from './notice-scheduling.service';
import { NoticeTargetingController } from './notice-targeting.controller';
import { NoticeTargetingService } from './notice-targeting.service';
import { NoticesController } from './notices.controller';
import { NoticesService } from './notices.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [NoticesController, NoticeSchedulingController, NoticeTargetingController, NoticeAttachmentsController],
  providers: [NoticesService, NoticeSchedulingService, NoticeTargetingService, NoticeAttachmentsService, PrismaService],
})
export class NoticesModule {}
