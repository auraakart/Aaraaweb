import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { BrandingController, BrandingContextController } from './branding.controller';
import { BrandingService } from './branding.service';

@Module({
  imports: [AuthModule, EntitlementsModule],
  controllers: [BrandingController, BrandingContextController],
  providers: [PrismaService, BrandingService],
})
export class BrandingModule {}
