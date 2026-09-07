import { Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Patch, Post, UnauthorizedException, UseGuards, createParamDecorator } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsISO8601, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPostalCode, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { ConsumerBookingsService } from './consumer-bookings.service';
import { ConsumerDispatchService } from './consumer-dispatch.service';
import { ConsumerPaymentsService } from './consumer-payments.service';
import { ConsumerServiceCompletionService } from './consumer-service-completion.service';
import { ConsumerServiceRatingsService } from './consumer-service-ratings.service';

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
  @IsOptional() @IsUUID() homeId?: string;
  @IsOptional() @IsIn(['HOME', 'SOCIETY_UNIT']) locationType?: 'HOME' | 'SOCIETY_UNIT';
  @IsOptional() @IsUUID() locationId?: string;
  @IsUUID() offeringId!: string;
  @IsISO8601() scheduledFrom!: string;
  @IsISO8601() scheduledUntil!: string;
  @IsOptional() @IsString() notes?: string;
}

class ConsumerPaymentIntentDto {
  @IsString() @MinLength(8) @MaxLength(100) idempotencyKey!: string;
}

class ConsumerServiceRatingDto {
  @IsInt() @Min(1) @Max(5) stars!: number;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

@Controller('consumer')
@UseGuards(BearerGuard)
export class ConsumerBookingsController {
  constructor(
    private readonly bookings: ConsumerBookingsService,
    private readonly payments: ConsumerPaymentsService,
    private readonly dispatch: ConsumerDispatchService,
    private readonly completion: ConsumerServiceCompletionService,
    private readonly ratings: ConsumerServiceRatingsService,
  ) {}

  @Get('homes')
  listHomes(@CurrentConsumerUser() userId: string) {
    return this.bookings.listHomes(this.requireUser(userId));
  }

  @Post('homes')
  createHome(@CurrentConsumerUser() userId: string, @Body() dto: ConsumerHomeDto) {
    return this.bookings.createHome(this.requireUser(userId), dto);
  }

  @Patch('homes/:id')
  updateHome(@CurrentConsumerUser() userId: string, @Param('id', ParseUUIDPipe) homeId: string, @Body() dto: ConsumerHomeDto) {
    return this.bookings.updateHome(this.requireUser(userId), homeId, dto);
  }

  @Get('services/bookings')
  listBookings(@CurrentConsumerUser() userId: string) {
    return this.bookings.listBookings(this.requireUser(userId));
  }

  @Get('services/bookings/:id/events')
  listBookingEvents(@CurrentConsumerUser() userId: string, @Param('id', ParseUUIDPipe) bookingId: string) {
    return this.bookings.listBookingEvents(this.requireUser(userId), bookingId);
  }

  @Get('services/bookings/:id/dispatch')
  getBookingDispatch(@CurrentConsumerUser() userId: string, @Param('id', ParseUUIDPipe) bookingId: string) {
    return this.dispatch.getConsumerDispatch(this.requireUser(userId), bookingId);
  }

  @Get('services/bookings/:id/completion')
  getBookingCompletion(@CurrentConsumerUser() userId: string, @Param('id', ParseUUIDPipe) bookingId: string) {
    return this.completion.getForConsumer(this.requireUser(userId), bookingId);
  }

  @Get('services/bookings/:id/rating')
  getBookingRating(@CurrentConsumerUser() userId: string, @Param('id', ParseUUIDPipe) bookingId: string) {
    return this.ratings.getMine(this.requireUser(userId), bookingId);
  }

  @Post('services/bookings')
  createBooking(@CurrentConsumerUser() userId: string, @Body() dto: ConsumerBookingDto) {
    return this.bookings.createBooking(this.requireUser(userId), {
      homeId: dto.homeId,
      locationType: dto.locationType,
      locationId: dto.locationId,
      offeringId: dto.offeringId,
      scheduledFrom: new Date(dto.scheduledFrom),
      scheduledUntil: new Date(dto.scheduledUntil),
      notes: dto.notes,
    });
  }

  @Post('services/bookings/:id/cancel')
  cancelBooking(@CurrentConsumerUser() userId: string, @Param('id', ParseUUIDPipe) bookingId: string) {
    return this.bookings.cancelBooking(this.requireUser(userId), bookingId);
  }

  @Post('services/bookings/:id/completion/confirm')
  confirmCompletion(@CurrentConsumerUser() userId: string, @Param('id', ParseUUIDPipe) bookingId: string) {
    return this.completion.confirmByConsumer(this.requireUser(userId), bookingId);
  }

  @Post('services/bookings/:id/rating')
  rateBooking(
    @CurrentConsumerUser() userId: string,
    @Param('id', ParseUUIDPipe) bookingId: string,
    @Body() dto: ConsumerServiceRatingDto,
  ) {
    return this.ratings.createMine(this.requireUser(userId), bookingId, dto.stars, dto.comment);
  }

  @Get('services/payments')
  listPayments(@CurrentConsumerUser() userId: string) {
    return this.payments.listMine(this.requireUser(userId));
  }

  @Get('services/bookings/:id/payments')
  listBookingPayments(@CurrentConsumerUser() userId: string, @Param('id', ParseUUIDPipe) bookingId: string) {
    return this.payments.listForBooking(this.requireUser(userId), bookingId);
  }

  @Post('services/bookings/:id/payments')
  createPaymentIntent(
    @CurrentConsumerUser() userId: string,
    @Param('id', ParseUUIDPipe) bookingId: string,
    @Body() dto: ConsumerPaymentIntentDto,
  ) {
    return this.payments.createIntent(this.requireUser(userId), bookingId, dto.idempotencyKey);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new UnauthorizedException('Authentication required');
    return userId;
  }
}
