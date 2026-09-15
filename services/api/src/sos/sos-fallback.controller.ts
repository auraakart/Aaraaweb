import { BadRequestException, Body, Controller, ExecutionContext, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { SosFallbackService } from './sos-fallback.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

const SOS_CATEGORIES = ['MEDICAL', 'FIRE', 'SECURITY', 'LIFT', 'OTHER'] as const;
const SOS_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM'] as const;

class FallbackTriggerSosDto {
  @IsUUID() unitId!: string;
  @IsOptional() @IsIn(SOS_CATEGORIES) category?: (typeof SOS_CATEGORIES)[number];
  @IsOptional() @IsIn(SOS_SEVERITIES) severity?: (typeof SOS_SEVERITIES)[number];
  @IsOptional() @IsString() @MaxLength(500) message?: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
}

@Controller('sos/fallback')
@UseGuards(BearerGuard)
export class SosFallbackController {
  constructor(private readonly fallback: SosFallbackService) {}

  @Post('trigger')
  trigger(@Body() dto: FallbackTriggerSosDto, @CurrentUser() userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return this.fallback.trigger(userId, dto);
  }
}
