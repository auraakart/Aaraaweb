import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { GatesModule } from '../gates/gates.module';
import { VisitorsController } from './visitors.controller';
import { VisitorService } from './visitor.service';
import { VisitorVerificationService } from './visitor-verification.service';

@Module({
  imports: [GatesModule, EntitlementsModule],
  controllers: [VisitorsController],
  providers: [PrismaService, VisitorService, VisitorVerificationService],
  exports: [VisitorService, VisitorVerificationService],
})
export class VisitorsModule {}
