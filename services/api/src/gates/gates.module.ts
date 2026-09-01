import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GatesController } from './gates.controller';
import { GateAccessGuard } from './gate-access.guard';
import { GateAuditService } from './gate-audit.service';

@Module({
  controllers: [GatesController],
  providers: [PrismaService, GateAccessGuard, GateAuditService],
  exports: [GateAccessGuard, GateAuditService],
})
export class GatesModule {}
