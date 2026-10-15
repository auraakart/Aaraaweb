import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { ConsumerProviderAgentService } from './consumer-provider-agent.service';

class LinkProviderAgentDto {
  @IsUUID()
  userId!: string;
}

@Controller('platform/services/provider-agents')
@UseGuards(BearerGuard, PermissionsGuard)
export class ConsumerProviderAgentPlatformController {
  constructor(private readonly agents: ConsumerProviderAgentService) {}

  @Post(':agentId/identity')
  @RequiresPermissions(AppPermission.PLATFORM_PROVIDER_VERIFY)
  link(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Body() dto: LinkProviderAgentDto,
  ) {
    return this.agents.linkAgent(agentId, dto.userId);
  }

  @Post(':agentId/identity/:userId/revoke')
  @RequiresPermissions(AppPermission.PLATFORM_PROVIDER_VERIFY)
  revoke(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.agents.revokeAgent(agentId, userId);
  }
}
