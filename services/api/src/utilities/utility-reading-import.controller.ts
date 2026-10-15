import { BadRequestException, Body, Controller, ExecutionContext, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { UtilityReadingImportService } from './utility-reading-import.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class UtilityReadingImportRowDto {
  @IsString() @MaxLength(60) meterCode!: string;
  @IsDateString() readingAt!: string;
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) value!: number;
  @IsOptional() @IsIn(['ACTUAL', 'RESET']) readingKind?: 'ACTUAL' | 'RESET';
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

class UtilityReadingImportDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => UtilityReadingImportRowDto)
  rows!: UtilityReadingImportRowDto[];
}

@Controller('utilities/v2/reading-imports')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class UtilityReadingImportController {
  constructor(private readonly imports: UtilityReadingImportService) {}

  @Post('preview')
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  preview(@Body() dto: UtilityReadingImportDto, @CurrentTenant() societyId: string) {
    return this.imports.preview(societyId, dto.rows);
  }

  @Post('commit')
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  commit(@Body() dto: UtilityReadingImportDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return this.imports.commit(societyId, userId, dto.rows);
  }
}
