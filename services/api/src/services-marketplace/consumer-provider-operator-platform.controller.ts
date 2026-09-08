import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { ConsumerProviderOperatorService } from './consumer-provider-operator.service';

class LinkProviderOperatorDto {
  @IsUUID()
  userId!: string;
}

@Controller('platform/services/providers')
@UseGuards(BearerGuard, PermissionsGuard)
export class ConsumerProviderOperatorPlatformController {
  constructor(private readonly providers: ConsumerProviderOperatorService) {}

  @Post(':providerId/operators')
  @RequiresPermissions(AppPermission.PLATFORM_PROVIDER_VERIFY)
  linkOperator(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Body() dto: LinkProviderOperatorDto,
  ) {
    return this.providers.linkOperator(providerId, dto.userId);
  }

  @Post(':providerId/operators/:userId/revoke')
  @RequiresPermissions(AppPermission.PLATFORM_PROVIDER_VERIFY)
  revokeOperator(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.providers.revokeOperator(providerId, userId);
  }
}
