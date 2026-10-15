import {
  Body,
  Controller,
  ExecutionContext,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
  createParamDecorator,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { ConsumerDispatchService, ConsumerDispatchStatus } from './consumer-dispatch.service';

const CurrentDispatchPlatformUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId;
});

class CreateConsumerProviderAgentDto {
  @IsString() @MaxLength(120) displayName!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) externalRef?: string;
}

class SetConsumerProviderAgentActiveDto {
  @IsBoolean() active!: boolean;
}

class AssignConsumerProviderAgentDto {
  @IsUUID() agentId!: string;
}

class SetConsumerDispatchStatusDto {
  @IsIn(['ACCEPTED', 'REJECTED', 'EN_ROUTE', 'ARRIVED', 'RELEASED'])
  status!: ConsumerDispatchStatus;

  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

@Controller('platform/services')
@UseGuards(BearerGuard, PermissionsGuard)
export class ConsumerDispatchPlatformController {
  constructor(private readonly dispatch: ConsumerDispatchService) {}

  @Get('providers/:providerId/agents')
  @RequiresPermissions(AppPermission.PLATFORM_CONSUMER_DISPATCH_READ)
  listAgents(@Param('providerId', ParseUUIDPipe) providerId: string) {
    return this.dispatch.listAgents(providerId);
  }

  @Post('providers/:providerId/agents')
  @RequiresPermissions(AppPermission.PLATFORM_CONSUMER_DISPATCH_MANAGE)
  createAgent(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Body() dto: CreateConsumerProviderAgentDto,
  ) {
    return this.dispatch.createAgent(providerId, dto);
  }

  @Patch('providers/:providerId/agents/:agentId')
  @RequiresPermissions(AppPermission.PLATFORM_CONSUMER_DISPATCH_MANAGE)
  setAgentActive(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Body() dto: SetConsumerProviderAgentActiveDto,
  ) {
    return this.dispatch.setAgentActive(providerId, agentId, dto.active);
  }

  @Get('consumer-bookings/:bookingId/assignments')
  @RequiresPermissions(AppPermission.PLATFORM_CONSUMER_DISPATCH_READ)
  listAssignments(@Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.dispatch.listAssignments(bookingId);
  }

  @Post('consumer-bookings/:bookingId/assignments')
  @RequiresPermissions(AppPermission.PLATFORM_CONSUMER_DISPATCH_MANAGE)
  assign(
    @CurrentDispatchPlatformUser() actorUserId: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: AssignConsumerProviderAgentDto,
  ) {
    if (!actorUserId) throw new UnauthorizedException('Authentication required');
    return this.dispatch.assign(actorUserId, bookingId, dto.agentId);
  }

  @Get('consumer-assignments/:assignmentId/events')
  @RequiresPermissions(AppPermission.PLATFORM_CONSUMER_DISPATCH_READ)
  listAssignmentEvents(@Param('assignmentId', ParseUUIDPipe) assignmentId: string) {
    return this.dispatch.listAssignmentEvents(assignmentId);
  }

  @Post('consumer-assignments/:assignmentId/status')
  @RequiresPermissions(AppPermission.PLATFORM_CONSUMER_DISPATCH_MANAGE)
  setAssignmentStatus(
    @CurrentDispatchPlatformUser() actorUserId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: SetConsumerDispatchStatusDto,
  ) {
    if (!actorUserId) throw new UnauthorizedException('Authentication required');
    return this.dispatch.transition(actorUserId, assignmentId, dto.status, dto.note);
  }
}
