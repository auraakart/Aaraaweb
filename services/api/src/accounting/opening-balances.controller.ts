import { BadRequestException, Body, Controller, ExecutionContext, Get, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { OpeningBalancesService } from './opening-balances.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class OpeningBalanceLineDto {
  @IsUUID() accountId!: string;
  @IsOptional() @IsUUID() fundId?: string;
  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsInt() @Min(0) debitPaise!: number;
  @IsInt() @Min(0) creditPaise!: number;
}

class ApplyOpeningBalanceDto {
  @IsString() @MinLength(1) @MaxLength(120) batchKey!: string;
  @IsUUID() periodId!: string;
  @IsString() @MinLength(1) @MaxLength(60) entryNumber!: string;
  @IsDateString() entryDate!: string;
  @IsString() @MinLength(1) @MaxLength(500) description!: string;
  @IsOptional() @IsString() @MaxLength(180) externalReference?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => OpeningBalanceLineDto) lines!: OpeningBalanceLineDto[];
}

@Controller('accounting/opening-balances')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.SOCIETY_ACCOUNTING)
export class OpeningBalancesController {
  constructor(private readonly openingBalances: OpeningBalancesService) {}

  @Get()
  @RequiresPermissions(AppPermission.FINANCE_READ)
  list(@CurrentTenant() societyId: string) {
    return this.openingBalances.list(societyId);
  }

  @Post()
  @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  apply(
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string | undefined,
    @Body() dto: ApplyOpeningBalanceDto,
  ) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return this.openingBalances.apply(societyId, userId, dto);
  }
}
