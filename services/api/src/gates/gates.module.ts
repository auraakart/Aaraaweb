import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GatesController } from './gates.controller';
import { GateAccessGuard } from './gate-access.guard';
import { GateAssignmentService } from './gate-assignment.service';
import { GateAuditService } from './gate-audit.service';

@Module({
  controllers: [GatesController],
  providers: [PrismaService, GateAccessGuard, GateAssignmentService, GateAuditService],
  exports: [GateAccessGuard, GateAssignmentService, GateAuditService],
})
export class GatesModule {}
