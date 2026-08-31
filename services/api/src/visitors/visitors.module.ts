import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VisitorsController } from './visitors.controller';
import { VisitorService } from './visitor.service';
import { VisitorVerificationService } from './visitor-verification.service';

@Module({
  controllers: [VisitorsController],
  providers: [PrismaService, VisitorService, VisitorVerificationService],
  exports: [VisitorService, VisitorVerificationService],
})
export class VisitorsModule {}
