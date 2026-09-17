import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GuardOperationsController } from './guard-operations.controller';
import { GuardOperationsService } from './guard-operations.service';
import { GuardShiftHandoverController } from './guard-shift-handover.controller';
import { GuardShiftHandoverService } from './guard-shift-handover.service';

@Module({
  controllers:[GuardOperationsController,GuardShiftHandoverController],
  providers:[GuardOperationsService,GuardShiftHandoverService,PrismaService],
  exports:[GuardOperationsService,GuardShiftHandoverService],
})
export class GuardOperationsModule {}
