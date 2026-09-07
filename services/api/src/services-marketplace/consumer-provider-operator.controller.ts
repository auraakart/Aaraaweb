import { Body, Controller, ExecutionContext, Get, Param, Patch, Post, UnauthorizedException, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { ConsumerDispatchStatus } from './consumer-dispatch.service';
import { ConsumerProviderOperatorService, ProviderBookingDecision } from './consumer-provider-operator.service';

const CurrentProviderUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId;
});

class PostalCodeDto {
  @Matches(/^[1-9][0-9]{5}$/)
  postalCode!: string;
}

class ActiveDto {
  @IsBoolean()
  active!: boolean;
}

class AvailabilityWindowDto {
  @IsInt() @Min(0) @Max(6) dayOfWeek!: number;
  @IsInt() @Min(0) @Max(1439) startMinute!: number;
  @IsInt() @Min(1) @Max(1440) endMinute!: number;
  @IsInt() @Min(1) slotCapacity!: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

class AvailabilityWindowPatchDto {
  @IsOptional() @IsInt() @Min(0) @Max(6) dayOfWeek?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1439) startMinute?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1440) endMinute?: number;
  @IsOptional() @IsInt() @Min(1) slotCapacity?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

class ProviderBookingResponseDto {
  @IsIn(['ACCEPT', 'DECLINE'])
  decision!: ProviderBookingDecision;

  @IsOptional()
  @IsString()
  note?: string;
}

class CreateProviderAgentDto {
  @IsString() @MaxLength(120) displayName!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) externalRef?: string;
}

class AssignProviderAgentDto {
  @IsUUID() agentId!: string;
}

class ProviderDispatchStatusDto {
  @IsIn(['ACCEPTED', 'REJECTED', 'EN_ROUTE', 'ARRIVED', 'RELEASED'])
  status!: ConsumerDispatchStatus;

  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

@Controller('provider/services')
@UseGuards(BearerGuard)
export class ConsumerProviderOperatorController {
  constructor(private readonly providers: ConsumerProviderOperatorService) {}

  @Get('me')
  me(@CurrentProviderUser() userId: string) {
    return this.providers.resolveProvider(this.requireUser(userId));
  }

  @Get('areas')
  areas(@CurrentProviderUser() userId: string) {
    return this.providers.listMyServiceAreas(this.requireUser(userId));
  }

  @Post('areas')
  addArea(@CurrentProviderUser() userId: string, @Body() dto: PostalCodeDto) {
    return this.providers.addMyServiceArea(this.requireUser(userId), dto.postalCode);
  }

  @Patch('areas/:areaId')
  setArea(@CurrentProviderUser() userId: string, @Param('areaId') areaId: string, @Body() dto: ActiveDto) {
    return this.providers.setMyServiceAreaActive(this.requireUser(userId), areaId, dto.active);
  }

  @Get('offerings')
  offerings(@CurrentProviderUser() userId: string) {
    return this.providers.listMyOfferings(this.requireUser(userId));
  }

  @Get('offerings/:offeringId/areas')
  offeringAreas(@CurrentProviderUser() userId: string, @Param('offeringId') offeringId: string) {
    return this.providers.listMyOfferingAreas(this.requireUser(userId), offeringId);
  }

  @Post('offerings/:offeringId/areas')
  addOfferingArea(@CurrentProviderUser() userId: string, @Param('offeringId') offeringId: string, @Body() dto: PostalCodeDto) {
    return this.providers.addMyOfferingArea(this.requireUser(userId), offeringId, dto.postalCode);
  }

  @Patch('offerings/:offeringId/areas/:areaId')
  setOfferingArea(
    @CurrentProviderUser() userId: string,
    @Param('offeringId') offeringId: string,
    @Param('areaId') areaId: string,
    @Body() dto: ActiveDto,
  ) {
    return this.providers.setMyOfferingAreaActive(this.requireUser(userId), offeringId, areaId, dto.active);
  }

  @Get('offerings/:offeringId/availability-windows')
  availabilityWindows(@CurrentProviderUser() userId: string, @Param('offeringId') offeringId: string) {
    return this.providers.listMyAvailabilityWindows(this.requireUser(userId), offeringId);
  }

  @Post('offerings/:offeringId/availability-windows')
  createAvailabilityWindow(
    @CurrentProviderUser() userId: string,
    @Param('offeringId') offeringId: string,
    @Body() dto: AvailabilityWindowDto,
  ) {
    return this.providers.createMyAvailabilityWindow(this.requireUser(userId), offeringId, dto);
  }

  @Patch('offerings/:offeringId/availability-windows/:windowId')
  updateAvailabilityWindow(
    @CurrentProviderUser() userId: string,
    @Param('offeringId') offeringId: string,
    @Param('windowId') windowId: string,
    @Body() dto: AvailabilityWindowPatchDto,
  ) {
    return this.providers.updateMyAvailabilityWindow(this.requireUser(userId), offeringId, windowId, dto);
  }

  @Get('bookings')
  bookings(@CurrentProviderUser() userId: string) {
    return this.providers.listMyBookings(this.requireUser(userId));
  }

  @Post('bookings/:bookingId/respond')
  respondToBooking(
    @CurrentProviderUser() userId: string,
    @Param('bookingId') bookingId: string,
    @Body() dto: ProviderBookingResponseDto,
  ) {
    return this.providers.respondToMyBooking(this.requireUser(userId), bookingId, dto.decision, dto.note);
  }

  @Get('agents')
  agents(@CurrentProviderUser() userId: string) {
    return this.providers.listMyAgents(this.requireUser(userId));
  }

  @Post('agents')
  createAgent(@CurrentProviderUser() userId: string, @Body() dto: CreateProviderAgentDto) {
    return this.providers.createMyAgent(this.requireUser(userId), dto);
  }

  @Patch('agents/:agentId')
  setAgentActive(
    @CurrentProviderUser() userId: string,
    @Param('agentId') agentId: string,
    @Body() dto: ActiveDto,
  ) {
    return this.providers.setMyAgentActive(this.requireUser(userId), agentId, dto.active);
  }

  @Get('bookings/:bookingId/assignments')
  bookingAssignments(@CurrentProviderUser() userId: string, @Param('bookingId') bookingId: string) {
    return this.providers.listMyBookingAssignments(this.requireUser(userId), bookingId);
  }

  @Post('bookings/:bookingId/assignments')
  assignBooking(
    @CurrentProviderUser() userId: string,
    @Param('bookingId') bookingId: string,
    @Body() dto: AssignProviderAgentDto,
  ) {
    return this.providers.assignMyBooking(this.requireUser(userId), bookingId, dto.agentId);
  }

  @Get('assignments/:assignmentId/events')
  assignmentEvents(@CurrentProviderUser() userId: string, @Param('assignmentId') assignmentId: string) {
    return this.providers.listMyAssignmentEvents(this.requireUser(userId), assignmentId);
  }

  @Post('assignments/:assignmentId/status')
  setAssignmentStatus(
    @CurrentProviderUser() userId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: ProviderDispatchStatusDto,
  ) {
    return this.providers.transitionMyAssignment(this.requireUser(userId), assignmentId, dto.status, dto.note);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new UnauthorizedException('Authentication required');
    return userId;
  }
}
