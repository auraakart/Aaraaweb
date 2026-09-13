import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyController } from './privacy.controller';
import { PrivacyRegistryController } from './privacy-registry.controller';
import { PrivacyRegistryService } from './privacy-registry.service';
import { PrivacyService } from './privacy.service';

@Module({
  controllers: [PrivacyController, PrivacyRegistryController],
  providers: [PrivacyService, PrivacyRegistryService, PrismaService],
  exports: [PrivacyService, PrivacyRegistryService],
})
export class PrivacyModule {}
