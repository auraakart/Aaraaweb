import { Global, Module } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';
import { BearerGuard } from './bearer.guard';
import { PrismaMembershipRepository } from './prisma-membership.repository';
import { AuthContextService } from './auth-context.service';
import { TenantGuard } from './tenant.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [RolesGuard, AuthService, OtpService, SessionService, BearerGuard, PrismaMembershipRepository, AuthContextService, TenantGuard],
  exports: [RolesGuard, AuthService, OtpService, SessionService, BearerGuard, PrismaMembershipRepository, AuthContextService, TenantGuard],
})
export class AuthModule {}
