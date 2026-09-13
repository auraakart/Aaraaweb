import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';

@Module({
  controllers: [PrivacyController],
  providers: [PrivacyService, PrismaService],
  exports: [PrivacyService],
})
export class PrivacyModule {}
