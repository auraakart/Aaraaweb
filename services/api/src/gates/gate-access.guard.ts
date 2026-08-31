import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { AuthenticatedRequest } from '../auth/bearer.guard';

@Injectable()
export class GateAccessGuard implements CanActivate {
  private readonly allowed = new Set<MembershipRole>([
    MembershipRole.SECURITY_GUARD,
    MembershipRole.SECURITY_SUPERVISOR,
  ]);

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth || !request.auth.roles.some((role) => this.allowed.has(role as MembershipRole))) {
      throw new ForbiddenException('Gate security role required');
    }
    return true;
  }
}
