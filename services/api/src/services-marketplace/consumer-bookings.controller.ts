import { Body, Controller, ExecutionContext, Get, Param, Patch, Post, UnauthorizedException, UseGuards, createParamDecorator } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsPostalCode, IsString, IsUUID, Max, Min } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { ConsumerBookingsService } from './consumer-bookings.service';

const CurrentConsumerUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId;
});

class ConsumerHomeDto {
  @IsString() @IsNotEmpty() label!: string;
  @IsString() @IsNotEmpty() addressLine1!: string;
  @IsOptional() @IsString() addressLine2?: string;
  @IsString() @IsNotEmpty() locality!: string;
  @IsString() @IsNotEmpty() city!: string;
  @IsString() @IsNotEmpty() state!: string;
  @IsPostalCode('IN') postalCode!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude?: number;
}

class ConsumerBookingDto {
  @IsUUID() homeId!: string;
  @IsUUID() offeringId!: string;
  @IsISO8601() scheduledFrom!: string;
  @IsISO8601() scheduledUntil!: string;
  @IsOptional() @IsString() notes?: string;
}

@Controller('consumer')
@UseGuards(BearerGuard)
export class ConsumerBookingsController {
  constructor(private readonly bookings: ConsumerBookingsService) {}

  @Get('homes')
  listHomes(@CurrentConsumerUser() userId: string) {
    return this.bookings.listHomes(this.requireUser(userId));
  }

  @Post('homes')
  createHome(@CurrentConsumerUser() userId: string, @Body() dto: ConsumerHomeDto) {
    return this.bookings.createHome(this.requireUser(userId), dto);
  }

  @Patch('homes/:id')
  updateHome(@CurrentConsumerUser() userId: string, @Param('id') homeId: string, @Body() dto: ConsumerHomeDto) {
    return this.bookings.updateHome(this.requireUser(userId), homeId, dto);
  }

  @Get('services/bookings')
  listBookings(@CurrentConsumerUser() userId: string) {
    return this.bookings.listBookings(this.requireUser(userId));
  }

  @Post('services/bookings')
  createBooking(@CurrentConsumerUser() userId: string, @Body() dto: ConsumerBookingDto) {
    return this.bookings.createBooking(this.requireUser(userId), {
      homeId: dto.homeId,
      offeringId: dto.offeringId,
      scheduledFrom: new Date(dto.scheduledFrom),
      scheduledUntil: new Date(dto.scheduledUntil),
      notes: dto.notes,
    });
  }

  @Post('services/bookings/:id/cancel')
  cancelBooking(@CurrentConsumerUser() userId: string, @Param('id') bookingId: string) {
    return this.bookings.cancelBooking(this.requireUser(userId), bookingId);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new UnauthorizedException('Authentication required');
    return userId;
  }
}
