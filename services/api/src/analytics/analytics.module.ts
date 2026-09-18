import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OperationalUsageController } from './operational-usage.controller';
import { OperationalUsageService } from './operational-usage.service';

@Module({
  controllers:[OperationalUsageController],
  providers:[OperationalUsageService,PrismaService],
  exports:[OperationalUsageService],
})
export class AnalyticsModule {}
