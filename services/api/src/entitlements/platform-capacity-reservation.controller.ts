import { Body, Controller, Header, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ArrayUnique, IsArray, IsEnum, IsInt, IsUUID, Min } from 'class-validator';
import { AppRole } from '../auth/auth.types';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProductFeature } from './entitlement.types';
import { PartnerCapacityReservationService } from './partner-capacity-reservation.service';
class CapacityReservationDto {
  @IsUUID() grantId!: string;
  @IsInt() @Min(1) expectedGrantVersion!: number;
  @IsInt() @Min(1) expectedOwnershipVersion!: number;
  @IsArray() @ArrayUnique() @IsEnum(ProductFeature, { each: true }) expectedFeatures!: ProductFeature[];
  @IsUUID() idempotencyKey!: string;
}
@Controller('platform/societies/:societyId/license-capacity-reservations')
@UseGuards(BearerGuard, RolesGuard)
@Roles(AppRole.SUPER_ADMIN)
export class PlatformCapacityReservationController {
  constructor(private readonly capacity: PartnerCapacityReservationService) {}
  @Post()
  @Header('Cache-Control', 'no-store')
  reserve(@Req() request: AuthenticatedRequest,
    @Param('societyId', ParseUUIDPipe) societyId: string, @Body() dto: CapacityReservationDto) {
    return this.capacity.reserve(request.auth!, societyId, dto);
  }
}
