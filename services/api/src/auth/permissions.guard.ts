import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from './bearer.guard';
import { AppRole } from './auth.types';
import { AppPermission, hasPermission } from './permission.types';
import { PERMISSIONS_KEY } from './permissions.decorator';

const OPERATIONAL_GATE_PERMISSIONS = new Set<AppPermission>([
  AppPermission.GATE_ACCESS_PROCESS,
  AppPermission.GATE_VISITOR_VERIFY,
  AppPermission.GATE_VISITOR_CHECK_IN_OUT,
]);

const SECURITY_OPERATION_ROLES = new Set<AppRole>([
  AppRole.SECURITY_GUARD,
  AppRole.SECURITY_SUPERVISOR,
]);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AppPermission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.auth;
    if (!principal) throw new ForbiddenException('Authenticated principal is required');

    const roles = principal.roles as AppRole[];
    if (!required.every((permission) => hasPermission(roles, permission))) {
      throw new ForbiddenException('Insufficient permissions');
    }

    // Operational gate actions are intentionally stricter than the generic
    // permission matrix. SUPER_ADMIN receives every platform permission for
    // support/configuration purposes, but must never inherit guard execution
    // authority such as verification or check-in/out. This preserves SoD at
    // the server boundary even when permissions are broadened in the future.
    if (
      required.some((permission) => OPERATIONAL_GATE_PERMISSIONS.has(permission)) &&
      !roles.some((role) => SECURITY_OPERATION_ROLES.has(role))
    ) {
      throw new ForbiddenException('Gate security role required');
    }

    return true;
  }
}
