import { Module } from '@nestjs/common';
import { MigrationController } from './migration.controller';
import { MigrationPreviewService } from './migration-preview.service';

@Module({
  controllers: [MigrationController],
  providers: [MigrationPreviewService],
})
export class MigrationModule {}
