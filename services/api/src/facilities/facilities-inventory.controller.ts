import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { FacilitiesInventoryService, FacilityStockMovementType } from './facilities-inventory.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);

class CreateInventoryItemDto {
  @IsString() @MinLength(1) @MaxLength(80) sku!: string;
  @IsString() @MinLength(1) @MaxLength(240) name!: string;
  @IsOptional() @IsString() @MaxLength(120) category?: string;
  @IsString() @MinLength(1) @MaxLength(32) unit!: string;
  @IsOptional() @IsNumber({maxDecimalPlaces:3}) @Min(0) @Max(999999999) reorderLevel?: number;
}

class StockMovementDto {
  @IsIn(['RECEIPT','ISSUE','ADJUSTMENT_IN','ADJUSTMENT_OUT']) movementType!: FacilityStockMovementType;
  @IsNumber({maxDecimalPlaces:3}) @Min(0.001) @Max(999999999) quantity!: number;
  @IsOptional() @IsUUID() workOrderId?: string;
  @IsOptional() @IsString() @MaxLength(160) reference?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

@Controller('facilities/inventory')
@UseGuards(BearerGuard,TenantGuard,PermissionsGuard)
export class FacilitiesInventoryController {
  constructor(private readonly inventory: FacilitiesInventoryService) {}

  @Get()
  @RequiresPermissions(AppPermission.FACILITIES_READ)
  list(@CurrentTenant() societyId:string) {
    return this.inventory.listItems(societyId);
  }

  @Post()
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  create(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:CreateInventoryItemDto) {
    return this.inventory.createItem(societyId,this.user(userId),dto);
  }

  @Get(':id/movements')
  @RequiresPermissions(AppPermission.FACILITIES_READ)
  movements(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string) {
    return this.inventory.listMovements(societyId,id);
  }

  @Post(':id/movements')
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  record(
    @CurrentTenant() societyId:string,
    @CurrentUser() userId:string|undefined,
    @Param('id',new ParseUUIDPipe()) id:string,
    @Body() dto:StockMovementDto,
  ) {
    return this.inventory.recordMovement(societyId,this.user(userId),id,dto);
  }

  private user(userId?:string) {
    if(!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
