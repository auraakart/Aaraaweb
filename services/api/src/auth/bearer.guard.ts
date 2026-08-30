import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { SessionService } from './session.service';

export type AuthenticatedRequest = Request & { auth?: ReturnType<SessionService['getPrincipal']> };

@Injectable()
export class BearerGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.header('authorization');
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Authentication required');
    request.auth = this.sessions.getPrincipal(header.slice(7));
    return true;
  }
}
