import { Module } from '@nestjs/common';
import { AccessIntegrationController } from './access-integration.controller';
import { AccessIntegrationService } from './access-integration.service';

@Module({
  controllers:[AccessIntegrationController],
  providers:[AccessIntegrationService],
})
export class AccessIntegrationModule {}
