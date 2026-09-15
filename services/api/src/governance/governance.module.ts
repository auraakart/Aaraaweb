import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { GovernanceArtifactsController } from './governance-artifacts.controller';
import { GovernanceController } from './governance.controller';
import { GovernanceElectionBallotDraftController } from './governance-election-ballot-draft.controller';
import { GovernanceElectionFoundationController } from './governance-election-foundation.controller';
import { GovernanceElectionProcedureController } from './governance-election-procedure.controller';
import { GovernancePollParticipationController } from './governance-poll-participation.controller';
import { GovernanceService } from './governance.service';

@Module({
  imports:[EntitlementsModule],
  controllers:[GovernanceController,GovernanceArtifactsController,GovernancePollParticipationController,GovernanceElectionFoundationController,GovernanceElectionBallotDraftController,GovernanceElectionProcedureController],
  providers:[GovernanceService,PrismaService],
  exports:[GovernanceService],
})
export class GovernanceModule{}
