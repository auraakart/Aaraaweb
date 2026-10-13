import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthPrincipal } from './auth.types';
import { SessionService } from './session.service';

export type AuthenticatedRequest = {
  auth?: AuthPrincipal;
  header(name: string): string | undefined;
};

@Injectable()
export class BearerGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.header('authorization');
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Authentication required');
    const principal = await this.sessions.getPrincipal(header.slice(7));
    if (principal.audience === 'PARTNER') throw new UnauthorizedException('Partner session cannot access this resource');
    request.auth = principal;
    return true;
  }
}
