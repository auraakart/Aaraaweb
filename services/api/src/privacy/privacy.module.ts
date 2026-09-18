import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyConsentController } from './privacy-consent.controller';
import { PrivacyConsentService } from './privacy-consent.service';
import { PrivacyController } from './privacy.controller';
import { PrivacyIncidentController } from './privacy-incident.controller';
import { PrivacyIncidentService } from './privacy-incident.service';
import { PrivacyRegistryController } from './privacy-registry.controller';
import { PrivacyRegistryService } from './privacy-registry.service';
import { PrivacyPlatformController } from './privacy-platform.controller';
import { PrivacySelfController } from './privacy-self.controller';
import { PrivacyService } from './privacy.service';
import { PrivacySubjectDataService } from './privacy-subject-data.service';

@Module({
  controllers: [PrivacyController, PrivacyRegistryController, PrivacyIncidentController, PrivacyConsentController, PrivacySelfController, PrivacyPlatformController],
  providers: [PrivacyService, PrivacyRegistryService, PrivacyIncidentService, PrivacyConsentService, PrivacySubjectDataService, PrismaService],
  exports: [PrivacyService, PrivacyRegistryService, PrivacyIncidentService, PrivacyConsentService, PrivacySubjectDataService],
})
export class PrivacyModule {}
