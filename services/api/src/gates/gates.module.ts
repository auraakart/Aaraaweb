import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GatesController } from './gates.controller';
import { GateAccessGuard } from './gate-access.guard';
import { GateAssignmentGuard } from './gate-assignment.guard';
import { GateAssignmentService } from './gate-assignment.service';
import { GateAuditService } from './gate-audit.service';

@Module({
  controllers: [GatesController],
  providers: [PrismaService, GateAccessGuard, GateAssignmentGuard, GateAssignmentService, GateAuditService],
  exports: [GateAccessGuard, GateAssignmentGuard, GateAssignmentService, GateAuditService],
})
export class GatesModule {}
