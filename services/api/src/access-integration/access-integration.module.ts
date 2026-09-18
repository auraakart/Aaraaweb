import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessIntegrationController } from './access-integration.controller';
import { AccessIntegrationService } from './access-integration.service';

@Module({
  controllers:[AccessIntegrationController],
  providers:[AccessIntegrationService,PrismaService],
})
export class AccessIntegrationModule {}
