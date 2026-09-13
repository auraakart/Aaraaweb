import { Body, Controller, ExecutionContext, Param, ParseUUIDPipe, Post, UnauthorizedException, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { ConsumerRebookingService } from './consumer-rebooking.service';

const CurrentConsumerUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId;
});

class ConsumerRebookDto {
  @IsISO8601() scheduledFrom!: string;
  @IsISO8601() scheduledUntil!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

@Controller('consumer/services/history')
@UseGuards(BearerGuard)
export class ConsumerRebookingController {
  constructor(private readonly rebooking: ConsumerRebookingService) {}

  @Post(':bookingId/rebook')
  rebook(
    @CurrentConsumerUser() userId: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: ConsumerRebookDto,
  ) {
    if (!userId) throw new UnauthorizedException('Authentication required');
    return this.rebooking.rebook(userId, bookingId, {
      scheduledFrom: new Date(dto.scheduledFrom),
      scheduledUntil: new Date(dto.scheduledUntil),
      notes: dto.notes,
    });
  }
}
