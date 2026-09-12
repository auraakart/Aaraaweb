import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GovernanceArtifactsController } from './governance-artifacts.controller';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';

@Module({
  controllers:[GovernanceController,GovernanceArtifactsController],
  providers:[GovernanceService,PrismaService],
  exports:[GovernanceService],
})
export class GovernanceModule{}
