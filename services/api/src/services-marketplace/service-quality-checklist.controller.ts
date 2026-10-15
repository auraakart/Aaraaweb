import { Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Put, UnauthorizedException, UseGuards, createParamDecorator } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { ServiceQualityChecklistService } from './service-quality-checklist.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);
const requireUser = (userId?: string) => {
  if (!userId) throw new UnauthorizedException('Authentication required');
  return userId;
};

class ChecklistItemDto {
  @IsString() @Matches(/^[a-z][a-z0-9_]{1,39}$/)
  id!: string;
  @IsString() @MinLength(2) @MaxLength(120)
  label!: string;
  @IsBoolean()
  required!: boolean;
}

class ChecklistReplacementDto {
  @IsInt() @Min(0) @Max(2147483646)
  expectedVersion!: number;
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ChecklistItemDto)
  items!: ChecklistItemDto[];
}

@Controller('provider/services/offerings')
@UseGuards(BearerGuard)
export class ProviderQualityChecklistController {
  constructor(private readonly quality: ServiceQualityChecklistService) {}

  @Get(':offeringId/quality-checklist')
  read(@CurrentUser() userId: string, @Param('offeringId', ParseUUIDPipe) offeringId: string) {
    return this.quality.getMyTemplate(requireUser(userId), offeringId);
  }

  @Put(':offeringId/quality-checklist')
  replace(@CurrentUser() userId: string, @Param('offeringId', ParseUUIDPipe) offeringId: string, @Body() body: ChecklistReplacementDto) {
    return this.quality.replaceMyTemplate(requireUser(userId), offeringId, body);
  }
}

@Controller('consumer/services')
@UseGuards(BearerGuard)
export class ConsumerQualityChecklistController {
  constructor(private readonly quality: ServiceQualityChecklistService) {}

  @Get('bookings/:bookingId/quality-checklist')
  snapshot(@CurrentUser() userId: string, @Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.quality.getConsumerBookingSnapshot(requireUser(userId), bookingId);
  }

  @Get('bookings/:bookingId/quality-checklist-preview')
  preview(@CurrentUser() userId: string, @Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.quality.getConsumerBookingPreview(requireUser(userId), bookingId);
  }
}
