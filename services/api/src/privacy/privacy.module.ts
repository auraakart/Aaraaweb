import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyConsentController } from './privacy-consent.controller';
import { PrivacyConsentService } from './privacy-consent.service';
import { PrivacyController } from './privacy.controller';
import { PrivacyIncidentController } from './privacy-incident.controller';
import { PrivacyIncidentService } from './privacy-incident.service';
import { PrivacyRegistryController } from './privacy-registry.controller';
import { PrivacyRegistryService } from './privacy-registry.service';
import { PrivacyService } from './privacy.service';

@Module({
  controllers: [PrivacyController, PrivacyRegistryController, PrivacyIncidentController, PrivacyConsentController],
  providers: [PrivacyService, PrivacyRegistryService, PrivacyIncidentService, PrivacyConsentService, PrismaService],
  exports: [PrivacyService, PrivacyRegistryService, PrivacyIncidentService, PrivacyConsentService],
})
export class PrivacyModule {}
