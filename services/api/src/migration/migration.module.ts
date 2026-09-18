import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';
import { MigrationBatchService } from './migration-batch.service';
import { MigrationController } from './migration.controller';
import { MigrationPreviewService } from './migration-preview.service';
import { MigrationStructuralCommitService } from './migration-structural-commit.service';
import { MigrationOperationalCommitService } from './migration-operational-commit.service';
import { MigrationCommitCoordinator } from './migration-commit-coordinator.service';
import { MigrationResidentCommitService } from './migration-resident-commit.service';
import { MigrationOpeningBalanceCommitService } from './migration-opening-balance-commit.service';

@Module({
  imports: [PrismaModule, AccountingModule],
  controllers: [MigrationController],
  providers: [MigrationPreviewService, MigrationBatchService, MigrationStructuralCommitService, MigrationOperationalCommitService, MigrationResidentCommitService, MigrationOpeningBalanceCommitService, MigrationCommitCoordinator],
})
export class MigrationModule {}
