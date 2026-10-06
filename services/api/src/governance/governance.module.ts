import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { CommunityEventsController } from './community-events.controller';
import { CommunityCirclesController } from './community-circles.controller';
import { CommunityEventsService } from './community-events.service';
import { CommunityCirclesService } from './community-circles.service';
import { GovernanceArtifactsController } from './governance-artifacts.controller';
import { GovernanceCommunityController } from './governance-community.controller';
import { GovernanceController } from './governance.controller';
import { GovernanceElectionBallotDraftController } from './governance-election-ballot-draft.controller';
import { GovernanceElectionFoundationController } from './governance-election-foundation.controller';
import { GovernanceElectionHoldController } from './governance-election-hold.controller';
import { GovernanceElectionPrivacyController } from './governance-election-privacy.controller';
import { GovernanceElectionProcedureController } from './governance-election-procedure.controller';
import { GovernanceElectionReadinessController } from './governance-election-readiness.controller';
import { GovernancePollParticipationController } from './governance-poll-participation.controller';
import { GovernanceService } from './governance.service';

@Module({
  imports:[EntitlementsModule],
  controllers:[GovernanceController,GovernanceCommunityController,CommunityEventsController,CommunityCirclesController,GovernanceArtifactsController,GovernancePollParticipationController,GovernanceElectionFoundationController,GovernanceElectionBallotDraftController,GovernanceElectionProcedureController,GovernanceElectionReadinessController,GovernanceElectionPrivacyController,GovernanceElectionHoldController],
  providers:[GovernanceService,CommunityEventsService,CommunityCirclesService,PrismaService],
  exports:[GovernanceService],
})
export class GovernanceModule{}
