import { BadRequestException, Controller, ExecutionContext, Get, UseGuards, createParamDecorator } from '@nestjs/common';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { UtilityResidentService } from './utility-resident.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

@Controller('utilities/v2/resident')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class UtilityResidentController {
  constructor(private readonly residentUtilities: UtilityResidentService) {}

  @Get('charges')
  @RequiresPermissions(AppPermission.PAYMENT_CREATE_OWN)
  listCharges(@CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return this.residentUtilities.listIssuedCharges(societyId, userId);
  }
}
