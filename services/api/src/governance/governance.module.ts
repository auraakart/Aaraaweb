import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { GovernanceArtifactsController } from './governance-artifacts.controller';
import { GovernanceController } from './governance.controller';
import { GovernancePollParticipationController } from './governance-poll-participation.controller';
import { GovernanceService } from './governance.service';

@Module({
  imports:[EntitlementsModule],
  controllers:[GovernanceController,GovernanceArtifactsController,GovernancePollParticipationController],
  providers:[GovernanceService,PrismaService],
  exports:[GovernanceService],
})
export class GovernanceModule{}
