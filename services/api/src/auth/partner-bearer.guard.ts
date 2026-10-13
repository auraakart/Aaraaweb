import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthenticatedRequest } from './bearer.guard';
import { SessionService } from './session.service';

/** Partner endpoints accept commercial audience and legacy Admin tokens.
 * Each commercial service independently revalidates its requested partner.
 */
@Injectable()
export class PartnerBearerGuard implements CanActivate {
  constructor(private readonly sessions:SessionService) {}
  async canActivate(context:ExecutionContext):Promise<boolean> {
    const request=context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header=request.header('authorization');
    if(!header?.startsWith('Bearer '))throw new UnauthorizedException('Authentication required');
    request.auth=await this.sessions.getPrincipal(header.slice(7));
    return true;
  }
}
