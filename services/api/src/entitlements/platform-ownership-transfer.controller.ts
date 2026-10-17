import { Body, Controller, Header, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { IsInt, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AppRole } from '../auth/auth.types';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SocietyOwnershipTransferService } from './society-ownership-transfer.service';

class OwnershipProposalDto {
  @IsUUID() toPartnerId!: string;
  @IsInt() @Min(1) @Max(2147483646) expectedOwnershipVersion!: number;
  @IsUUID() idempotencyKey!: string;
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}

@Controller('platform/societies/:societyId/ownership-transfers')
@UseGuards(BearerGuard, RolesGuard)
@Roles(AppRole.SUPER_ADMIN)
export class PlatformOwnershipTransferController {
  constructor(private readonly ownership: SocietyOwnershipTransferService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  propose(@Req() request: AuthenticatedRequest,
    @Param('societyId', ParseUUIDPipe) societyId: string, @Body() dto: OwnershipProposalDto) {
    return this.ownership.propose(request.auth!, societyId, dto);
  }

  @Post(':requestId/approve')
  @Header('Cache-Control', 'no-store')
  approve(@Req() request: AuthenticatedRequest,
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string) {
    return this.ownership.approve(request.auth!, societyId, requestId);
  }
}
