import { BadRequestException, Body, Controller, ExecutionContext, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { OccupancyLifecycleSelfService } from './occupancy-lifecycle-self.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
class TenantMoveInByPhoneDto{@IsUUID() unitId!:string;@IsString() @MinLength(8) @MaxLength(20) tenantPhone!:string;@IsISO8601() effectiveAt!:string;@IsOptional() @IsString() @MaxLength(500) reason?:string;}

@Controller('occupancy-lifecycle/self')
@UseGuards(BearerGuard,TenantGuard)
export class OccupancyLifecycleSelfController{
  constructor(private readonly selfService:OccupancyLifecycleSelfService){}
  @Post('tenant-move-ins') requestTenantMoveIn(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:TenantMoveInByPhoneDto){return this.selfService.requestTenantMoveInByPhone(societyId,this.user(userId),{...dto,effectiveAt:this.date(dto.effectiveAt)});}
  private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated user is required');return userId;}
  private date(value:string){const date=new Date(value);if(Number.isNaN(date.getTime()))throw new BadRequestException('Invalid effectiveAt');return date;}
}
