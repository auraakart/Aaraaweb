import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsController } from './reports.controller';
import { ReportsExportService } from './reports-export.service';
import { ReportsService } from './reports.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsExportService, PrismaService],
})
export class ReportsModule {}
