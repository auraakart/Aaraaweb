import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/bearer.guard';
import { AppRole } from '../auth/auth.types';

const BROADCAST_ROLES = new Set<AppRole>([
  AppRole.SOCIETY_ADMIN,
  AppRole.SECURITY_SUPERVISOR,
]);

@Injectable()
export class EmergencyBroadcastManageGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().auth;
    if (!principal) throw new ForbiddenException('Authenticated principal is required');
    const roles = principal.roles as AppRole[];
    if (!roles.some((role) => BROADCAST_ROLES.has(role))) {
      throw new ForbiddenException('Society admin or security supervisor role required for emergency broadcast');
    }
    return true;
  }
}