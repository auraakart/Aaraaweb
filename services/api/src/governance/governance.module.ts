import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';

@Module({
  controllers:[GovernanceController],
  providers:[GovernanceService,PrismaService],
  exports:[GovernanceService],
})
export class GovernanceModule{}
