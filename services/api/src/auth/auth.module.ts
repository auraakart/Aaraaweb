import { Global, Module } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { PermissionsGuard } from './permissions.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthStateStore } from './auth-state.store';
import { SessionService } from './session.service';
import { BearerGuard } from './bearer.guard';
import { PrismaMembershipRepository } from './prisma-membership.repository';
import { AuthContextService } from './auth-context.service';
import { TenantGuard } from './tenant.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [RolesGuard, PermissionsGuard, AuthService, AuthStateStore, SessionService, BearerGuard, PrismaMembershipRepository, AuthContextService, TenantGuard],
  exports: [RolesGuard, PermissionsGuard, AuthService, AuthStateStore, SessionService, BearerGuard, PrismaMembershipRepository, AuthContextService, TenantGuard],
})
export class AuthModule {}
