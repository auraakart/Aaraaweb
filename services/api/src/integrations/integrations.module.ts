import { Module } from '@nestjs/common';
import { IntegrationRegistryController } from './integration-registry.controller';
import { IntegrationRegistryService } from './integration-registry.service';

@Module({
  controllers: [IntegrationRegistryController],
  providers: [IntegrationRegistryService],
})
export class IntegrationsModule {}
