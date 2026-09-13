import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyController } from './privacy.controller';
import { PrivacyIncidentController } from './privacy-incident.controller';
import { PrivacyIncidentService } from './privacy-incident.service';
import { PrivacyRegistryController } from './privacy-registry.controller';
import { PrivacyRegistryService } from './privacy-registry.service';
import { PrivacyService } from './privacy.service';

@Module({
  controllers: [PrivacyController, PrivacyRegistryController, PrivacyIncidentController],
  providers: [PrivacyService, PrivacyRegistryService, PrivacyIncidentService, PrismaService],
  exports: [PrivacyService, PrivacyRegistryService, PrivacyIncidentService],
})
export class PrivacyModule {}
