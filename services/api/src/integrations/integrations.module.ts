import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationConfigurationService } from './integration-configuration.service';
import { IntegrationRegistryController } from './integration-registry.controller';
import { IntegrationRegistryService } from './integration-registry.service';

@Module({
  controllers: [IntegrationRegistryController],
  providers: [IntegrationRegistryService, IntegrationConfigurationService, PrismaService],
})
export class IntegrationsModule {}
