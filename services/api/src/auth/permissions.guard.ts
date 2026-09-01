import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from './bearer.guard';
import { AppRole } from './auth.types';
import { AppPermission, hasPermission } from './permission.types';
import { PERMISSIONS_KEY } from './permissions.decorator';

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
    return true;
  }
}
