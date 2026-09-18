import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MigrationBatchService } from './migration-batch.service';
import { MigrationController } from './migration.controller';
import { MigrationPreviewService } from './migration-preview.service';
import { MigrationStructuralCommitService } from './migration-structural-commit.service';
import { MigrationOperationalCommitService } from './migration-operational-commit.service';
import { MigrationCommitCoordinator } from './migration-commit-coordinator.service';
import { MigrationResidentCommitService } from './migration-resident-commit.service';

@Module({
  imports: [PrismaModule],
  controllers: [MigrationController],
  providers: [MigrationPreviewService, MigrationBatchService, MigrationStructuralCommitService, MigrationOperationalCommitService, MigrationResidentCommitService, MigrationCommitCoordinator],
})
export class MigrationModule {}
