import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedRequest } from './bearer.guard';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth?.societyId) throw new ForbiddenException('Society context is required');
    // A selected society alone is not an authority grant. Independent-home
    // sessions and partner-only commercial memberships carry no society roles.
    if (!request.auth.roles?.length) throw new ForbiddenException('Active society role is required');
    return true;
  }
}
