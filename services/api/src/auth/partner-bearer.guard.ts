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
    const principal=await this.sessions.getPrincipal(header.slice(7),request);
    // Bound sessions may call only explicitly scoped routes for this partner.
    // Portfolio discovery and global invitation inbox stay on the platform portal.
    if(principal.hostPartnerId && request.params?.partnerId!==principal.hostPartnerId)
      throw new UnauthorizedException('Partner host scope mismatch');
    request.auth=principal;
    return true;
  }
}
