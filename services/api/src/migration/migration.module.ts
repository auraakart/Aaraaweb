import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MigrationBatchService } from './migration-batch.service';
import { MigrationController } from './migration.controller';
import { MigrationPreviewService } from './migration-preview.service';
import { MigrationStructuralCommitService } from './migration-structural-commit.service';

@Module({
  imports: [PrismaModule],
  controllers: [MigrationController],
  providers: [MigrationPreviewService, MigrationBatchService, MigrationStructuralCommitService],
})
export class MigrationModule {}
