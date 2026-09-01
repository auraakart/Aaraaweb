import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { WorkforceController } from './workforce.controller';
import { WorkforceService } from './workforce.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [WorkforceController],
  providers: [PrismaService, WorkforceService],
  exports: [WorkforceService],
})
export class WorkforceModule {}
