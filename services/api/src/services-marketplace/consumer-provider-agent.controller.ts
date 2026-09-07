import { Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UnauthorizedException, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { ConsumerDispatchStatus } from './consumer-dispatch.service';
import { ConsumerProviderAgentService } from './consumer-provider-agent.service';

const CurrentAgentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId;
});

class AgentDispatchStatusDto {
  @IsIn(['ACCEPTED', 'REJECTED', 'EN_ROUTE', 'ARRIVED'])
  status!: ConsumerDispatchStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

@Controller('provider-agent/services')
@UseGuards(BearerGuard)
export class ConsumerProviderAgentController {
  constructor(private readonly agents: ConsumerProviderAgentService) {}

  @Get('me')
  me(@CurrentAgentUser() userId: string) {
    return this.agents.resolveAgent(this.requireUser(userId));
  }

  @Get('assignments')
  assignments(@CurrentAgentUser() userId: string) {
    return this.agents.listMyAssignments(this.requireUser(userId));
  }

  @Get('assignments/:assignmentId/events')
  events(
    @CurrentAgentUser() userId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    return this.agents.listMyAssignmentEvents(this.requireUser(userId), assignmentId);
  }

  @Post('assignments/:assignmentId/status')
  transition(
    @CurrentAgentUser() userId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: AgentDispatchStatusDto,
  ) {
    return this.agents.transitionMyAssignment(this.requireUser(userId), assignmentId, dto.status, dto.note);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new UnauthorizedException('Authentication required');
    return userId;
  }
}
