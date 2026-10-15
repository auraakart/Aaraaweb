import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, Post, Query, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsArray, IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { CheckpointInput, GatePassInput, GuardOperationsService, IncidentInput, WatchlistAssessmentInput, WatchlistInput } from './guard-operations.service';

const CurrentUser = createParamDecorator((_data:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);

class WatchlistAssessmentDto implements WatchlistAssessmentInput { @IsString() @IsNotEmpty() subjectName!:string; @IsOptional() @IsString() phone?:string; @IsOptional() @IsString() vehicleNumber?:string; }
class WatchlistDto implements WatchlistInput { @IsIn(['WATCH','DENY','INFO']) kind!:'WATCH'|'DENY'|'INFO'; @IsString() @IsNotEmpty() subjectName!:string; @IsOptional() @IsString() phone?:string; @IsOptional() @IsString() vehicleNumber?:string; @IsString() @IsNotEmpty() reason!:string; @IsOptional() @IsDateString() validFrom?:string; @IsOptional() @IsDateString() validUntil?:string; }
class GatePassDto implements GatePassInput { @IsOptional() @IsUUID() gateId?:string; @IsOptional() @IsUUID() unitId?:string; @IsString() @IsNotEmpty() referenceCode!:string; @IsIn(['MATERIAL_IN','MATERIAL_OUT','MOVE_IN','MOVE_OUT']) movementType!:'MATERIAL_IN'|'MATERIAL_OUT'|'MOVE_IN'|'MOVE_OUT'; @IsString() @IsNotEmpty() subjectName!:string; @IsString() @IsNotEmpty() itemDescription!:string; @IsOptional() @IsString() vehicleNumber?:string; @IsOptional() @IsDateString() validFrom?:string; @IsOptional() @IsDateString() validUntil?:string; }
class CheckpointDto implements CheckpointInput { @IsString() @IsNotEmpty() code!:string; @IsString() @IsNotEmpty() name!:string; @IsOptional() @IsString() location?:string; }
class ScanDto { @IsOptional() @IsUUID() gateId?:string; @IsOptional() @IsString() note?:string; }
class IncidentDto implements IncidentInput { @IsOptional() @IsUUID() gateId?:string; @IsIn(['LOW','MEDIUM','HIGH','CRITICAL']) severity!:'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'; @IsString() @IsNotEmpty() category!:string; @IsString() @IsNotEmpty() title!:string; @IsOptional() @IsString() description?:string; @IsOptional() @IsArray() @IsString({each:true}) mediaRefs?:string[]; @IsOptional() @IsDateString() occurredAt?:string; }
class ReviewIncidentDto { @IsIn(['REVIEWED','CLOSED']) status!:'REVIEWED'|'CLOSED'; @IsOptional() @IsString() resolution?:string; }
class OverstayEscalationDto { @IsOptional() @IsString() note?:string; }

@Controller('guard-operations')
@UseGuards(BearerGuard,TenantGuard,PermissionsGuard)
export class GuardOperationsController {
  constructor(private readonly operations:GuardOperationsService) {}
  private actor(userId:string){if(!userId)throw new BadRequestException('Authenticated guard is required');return userId;}

  @Get('summary') @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  summary(@CurrentTenant() societyId:string,@Query('overstayMinutes') raw?:string){const minutes=raw?Number.parseInt(raw,10):240;return this.operations.summary(societyId,Number.isFinite(minutes)?minutes:240);}
  @Get('overstays') @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  overstays(@CurrentTenant() societyId:string,@Query('minutes') raw?:string){const minutes=raw?Number.parseInt(raw,10):240;return this.operations.overstays(societyId,minutes);}
  @Post('overstays/:id/escalate') @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  escalateOverstay(@CurrentTenant() societyId:string,@CurrentUser() userId:string,@Param('id') id:string,@Body() body:OverstayEscalationDto){return this.operations.escalateOverstay(societyId,this.actor(userId),id,body.note);}

  @Get('watchlist/history') @RequiresPermissions(AppPermission.GATE_SUPERVISE)
  watchlistHistory(@CurrentTenant() societyId:string){return this.operations.watchlistHistory(societyId);}
  @Get('watchlist') @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  watchlist(@CurrentTenant() societyId:string){return this.operations.watchlist(societyId);}
  @Post('watchlist/assess') @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  assessWatchlist(@CurrentTenant() societyId:string,@Body() body:WatchlistAssessmentDto){return this.operations.assessWatchlist(societyId,body);}

  @Post('watchlist') @RequiresPermissions(AppPermission.GATE_SUPERVISE)
  createWatchlist(@CurrentTenant() societyId:string,@CurrentUser() userId:string,@Body() body:WatchlistDto){return this.operations.createWatchlist(societyId,this.actor(userId),body);}
  @Post('watchlist/:id/deactivate') @RequiresPermissions(AppPermission.GATE_SUPERVISE)
  deactivateWatchlist(@CurrentTenant() societyId:string,@CurrentUser() userId:string,@Param('id') id:string){return this.operations.deactivateWatchlist(societyId,this.actor(userId),id);}

  @Get('passes') @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  passes(@CurrentTenant() societyId:string){return this.operations.passes(societyId);}
  @Post('passes') @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  createPass(@CurrentTenant() societyId:string,@CurrentUser() userId:string,@Body() body:GatePassDto){return this.operations.createPass(societyId,this.actor(userId),body);}
  @Post('passes/:id/process') @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  processPass(@CurrentTenant() societyId:string,@CurrentUser() userId:string,@Param('id') id:string){return this.operations.processPass(societyId,this.actor(userId),id);}
  @Post('passes/:id/cancel') @RequiresPermissions(AppPermission.GATE_SUPERVISE)
  cancelPass(@CurrentTenant() societyId:string,@CurrentUser() userId:string,@Param('id') id:string){return this.operations.cancelPass(societyId,this.actor(userId),id);}

  @Get('patrol/checkpoints') @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  checkpoints(@CurrentTenant() societyId:string){return this.operations.checkpoints(societyId);}
  @Get('patrol/status') @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  patrolStatus(@CurrentTenant() societyId:string,@Query('staleHours') raw?:string){const hours=raw?Number.parseInt(raw,10):8;return this.operations.patrolStatus(societyId,Number.isFinite(hours)?hours:8);}
  @Post('patrol/checkpoints') @RequiresPermissions(AppPermission.GATE_SUPERVISE)
  createCheckpoint(@CurrentTenant() societyId:string,@CurrentUser() userId:string,@Body() body:CheckpointDto){return this.operations.createCheckpoint(societyId,this.actor(userId),body);}
  @Post('patrol/checkpoints/:id/scan') @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  scanCheckpoint(@CurrentTenant() societyId:string,@CurrentUser() userId:string,@Param('id') id:string,@Body() body:ScanDto){return this.operations.scanCheckpoint(societyId,this.actor(userId),id,body.gateId,body.note);}

  @Get('incidents') @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  incidents(@CurrentTenant() societyId:string){return this.operations.incidents(societyId);}
  @Post('incidents') @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  createIncident(@CurrentTenant() societyId:string,@CurrentUser() userId:string,@Body() body:IncidentDto){return this.operations.createIncident(societyId,this.actor(userId),body);}
  @Post('incidents/:id/review') @RequiresPermissions(AppPermission.GATE_SUPERVISE)
  reviewIncident(@CurrentTenant() societyId:string,@CurrentUser() userId:string,@Param('id') id:string,@Body() body:ReviewIncidentDto){return this.operations.reviewIncident(societyId,this.actor(userId),id,body.status,body.resolution);}
}
