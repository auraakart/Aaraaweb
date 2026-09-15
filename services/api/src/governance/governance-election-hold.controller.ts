import { BadRequestException, Body, ConflictException, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { Prisma } from '@prisma/client';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { PrismaService } from '../prisma/prisma.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
type HoldAction='OPEN_HOLD'|'RESOLVE_HOLD'|'CANCEL_HOLD';
type HoldCategory='ELECTORATE'|'PROCEDURE'|'PRIVACY_SECURITY'|'LEGAL_POLICY'|'INCIDENT'|'OTHER';
type HoldRow={id:string;ballotDraftId:string;sequence:number;action:HoldAction;category:HoldCategory;reason:string;createdByUserId:string;createdAt:Date};

class OpenHoldDto{
  @IsIn(['ELECTORATE','PROCEDURE','PRIVACY_SECURITY','LEGAL_POLICY','INCIDENT','OTHER']) category!:HoldCategory;
  @IsString() @MinLength(1) @MaxLength(2000) reason!:string;
}
class CloseHoldDto{
  @IsString() @MinLength(1) @MaxLength(2000) reason!:string;
}

@Controller('governance/elections/ballot-drafts/:id/holds')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.GOVERNANCE_POLLS)
export class GovernanceElectionHoldController{
  constructor(private readonly prisma:PrismaService){}

  @Get()
  @RequiresPermissions(AppPermission.GOVERNANCE_READ)
  list(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) ballotDraftId:string){
    return this.prisma.$queryRaw<HoldRow[]>(Prisma.sql`
      SELECT "id","ballotDraftId","sequence","action","category","reason","createdByUserId","createdAt"
      FROM "GovernanceElectionHoldEvent" WHERE "societyId"=${societyId}::uuid AND "ballotDraftId"=${ballotDraftId}::uuid ORDER BY "sequence" DESC
    `);
  }

  @Post()
  @RequiresPermissions(AppPermission.GOVERNANCE_MANAGE)
  open(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) ballotDraftId:string,@Body() dto:OpenHoldDto){
    return this.record(societyId,ballotDraftId,this.user(userId),'OPEN_HOLD',dto.category,dto.reason);
  }

  @Post('resolve')
  @RequiresPermissions(AppPermission.GOVERNANCE_MANAGE)
  resolve(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) ballotDraftId:string,@Body() dto:CloseHoldDto){
    return this.close(societyId,ballotDraftId,this.user(userId),'RESOLVE_HOLD',dto.reason);
  }

  @Post('cancel')
  @RequiresPermissions(AppPermission.GOVERNANCE_MANAGE)
  cancel(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) ballotDraftId:string,@Body() dto:CloseHoldDto){
    return this.close(societyId,ballotDraftId,this.user(userId),'CANCEL_HOLD',dto.reason);
  }

  private async close(societyId:string,ballotDraftId:string,actor:string,action:'RESOLVE_HOLD'|'CANCEL_HOLD',reason:string){
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Society" WHERE "id"=${societyId}::uuid FOR UPDATE`);
      await this.ballot(tx,societyId,ballotDraftId);
      const latest=await this.latest(tx,societyId,ballotDraftId);
      if(!latest||latest.action!=='OPEN_HOLD')throw new ConflictException('No active election hold exists');
      if(latest.createdByUserId===actor)throw new ConflictException('Election hold must be resolved or cancelled by a different governance actor than the hold creator');
      return this.insert(tx,societyId,ballotDraftId,actor,action,latest.category,reason,(latest.sequence??0)+1);
    });
  }

  private async record(societyId:string,ballotDraftId:string,actor:string,action:'OPEN_HOLD',category:HoldCategory,reason:string){
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Society" WHERE "id"=${societyId}::uuid FOR UPDATE`);
      await this.ballot(tx,societyId,ballotDraftId);
      const latest=await this.latest(tx,societyId,ballotDraftId);
      if(latest?.action==='OPEN_HOLD')throw new ConflictException('An active election hold already exists');
      return this.insert(tx,societyId,ballotDraftId,actor,action,category,reason,(latest?.sequence??0)+1);
    });
  }

  private async insert(tx:Prisma.TransactionClient,societyId:string,ballotDraftId:string,actor:string,action:HoldAction,category:HoldCategory,reason:string,sequence:number){
    const clean=reason.trim(); if(!clean)throw new BadRequestException('Election hold reason is required');
    const rows=await tx.$queryRaw<HoldRow[]>(Prisma.sql`
      INSERT INTO "GovernanceElectionHoldEvent" ("societyId","ballotDraftId","sequence","action","category","reason","createdByUserId")
      VALUES (${societyId}::uuid,${ballotDraftId}::uuid,${sequence},${action},${category},${clean},${actor}::uuid)
      RETURNING "id","ballotDraftId","sequence","action","category","reason","createdByUserId","createdAt"
    `);
    return {...rows[0],active:action==='OPEN_HOLD',executionEnabled:false,castingEnabled:false};
  }

  private async ballot(tx:Prisma.TransactionClient,societyId:string,ballotDraftId:string){
    const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "GovernanceElectionBallotDraft" WHERE "id"=${ballotDraftId}::uuid AND "societyId"=${societyId}::uuid LIMIT 1`);
    if(!rows.length)throw new BadRequestException('Ballot draft not found');
  }
  private async latest(tx:Prisma.TransactionClient,societyId:string,ballotDraftId:string){
    const rows=await tx.$queryRaw<HoldRow[]>(Prisma.sql`SELECT "id","ballotDraftId","sequence","action","category","reason","createdByUserId","createdAt" FROM "GovernanceElectionHoldEvent" WHERE "societyId"=${societyId}::uuid AND "ballotDraftId"=${ballotDraftId}::uuid ORDER BY "sequence" DESC LIMIT 1`);
    return rows[0];
  }
  private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated user is required');return userId;}
}
