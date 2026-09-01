import { BadRequestException, Controller, ExecutionContext, Sse, UseGuards, createParamDecorator } from '@nestjs/common';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { NotificationRealtimeService } from './notification-realtime.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

@Controller('notifications')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class NotificationsController {
  constructor(private readonly realtime: NotificationRealtimeService) {}

  @Sse('resident-stream')
  @RequiresPermissions(AppPermission.ACCESS_READ_OWN)
  residentStream(@CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.realtime.residentStream(societyId, userId);
  }

  @Sse('gate-stream')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  gateStream(@CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    if (!userId) throw new BadRequestException('Authenticated guard is required');
    return this.realtime.gateStream(societyId);
  }
}
