import { Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UnauthorizedException, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { ServiceQualityEvidenceService } from './service-quality-evidence.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);
const requireUser = (userId?: string) => {
  if (!userId) throw new UnauthorizedException('Authentication required');
  return userId;
};

class QualityEvidenceDto {
  @IsString() @Matches(/^[a-z][a-z0-9_]{1,39}$/)
  itemId!: string;
  @IsBoolean()
  passed!: boolean;
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

@Controller('provider-agent/services')
@UseGuards(BearerGuard)
export class AgentQualityEvidenceController {
  constructor(private readonly service: ServiceQualityEvidenceService) {}

  @Get('assignments/:assignmentId/quality-evidence')
  events(@CurrentUser() userId: string, @Param('assignmentId', ParseUUIDPipe) assignmentId: string) {
    return this.service.listForAgent(requireUser(userId), assignmentId);
  }

  @Post('assignments/:assignmentId/quality-evidence')
  record(@CurrentUser() userId: string, @Param('assignmentId', ParseUUIDPipe) assignmentId: string, @Body() dto: QualityEvidenceDto) {
    return this.service.recordForAgent(requireUser(userId), assignmentId, dto);
  }
}

@Controller('consumer/services')
@UseGuards(BearerGuard)
export class ConsumerQualityEvidenceController {
  constructor(private readonly service: ServiceQualityEvidenceService) {}

  @Get('bookings/:bookingId/quality-evidence')
  list(@CurrentUser() userId: string, @Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.service.listForConsumer(requireUser(userId), bookingId);
  }
}
