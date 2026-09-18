import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsAnalyticsController } from './reports-analytics.controller';
import { ReportsAnalyticsService } from './reports-analytics.service';
import { ReportsController } from './reports.controller';
import { ReportsExportService } from './reports-export.service';
import { ReportsService } from './reports.service';
import { SecurityEventRetentionService } from './security-event-retention.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [ReportsController, ReportsAnalyticsController],
  providers: [ReportsService, ReportsAnalyticsService, ReportsExportService, SecurityEventRetentionService, PrismaService],
})
export class ReportsModule {}
