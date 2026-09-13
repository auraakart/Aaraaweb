import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GovernanceArtifactsController } from './governance-artifacts.controller';
import { GovernanceController } from './governance.controller';
import { GovernancePollParticipationController } from './governance-poll-participation.controller';
import { GovernanceService } from './governance.service';

@Module({
  controllers:[GovernanceController,GovernanceArtifactsController,GovernancePollParticipationController],
  providers:[GovernanceService,PrismaService],
  exports:[GovernanceService],
})
export class GovernanceModule{}
