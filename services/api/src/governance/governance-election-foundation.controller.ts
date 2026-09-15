import { BadRequestException, Body, ConflictException, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
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
type EligibilityMode='VERIFIED_OWNERS'|'VERIFIED_OWNERS_AND_ACTIVE_OCCUPANTS';

class RecordElectionPolicyDto{
  @IsBoolean() enabled!:boolean;
  @IsIn(['VERIFIED_OWNERS','VERIFIED_OWNERS_AND_ACTIVE_OCCUPANTS']) eligibilityMode!:EligibilityMode;
  @IsString() @MinLength(1) @MaxLength(1000) policyReference!:string;
  @IsOptional() @IsString() @MaxLength(2000) note?:string;
}

type PolicyRow={id:string;version:number;enabled:boolean;eligibilityMode:EligibilityMode;policyReference:string;note:string|null;createdByUserId:string;createdAt:Date};
type SnapshotRow={id:string;policyRevisionId:string;createdByUserId:string;createdAt:Date};

@Controller('governance/elections')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.GOVERNANCE_POLLS)
export class GovernanceElectionFoundationController{
  constructor(private readonly prisma:PrismaService){}

  @Get('policy')
  @RequiresPermissions(AppPermission.GOVERNANCE_READ)
  async currentPolicy(@CurrentTenant() societyId:string){
    const rows=await this.prisma.$queryRaw<PolicyRow[]>(Prisma.sql`
      SELECT "id","version","enabled","eligibilityMode","policyReference","note","createdByUserId","createdAt"
      FROM "GovernanceElectionPolicyRevision"
      WHERE "societyId"=${societyId}::uuid
      ORDER BY "version" DESC LIMIT 1
    `);
    return rows[0]??{configured:false,enabled:false};
  }

  @Post('policy-revisions')
  @RequiresPermissions(AppPermission.GOVERNANCE_MANAGE)
  async recordPolicy(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:RecordElectionPolicyDto){
    const actor=this.user(userId),reference=dto.policyReference.trim();
    if(!reference)throw new BadRequestException('Policy or bye-law reference is required');
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Society" WHERE "id"=${societyId}::uuid FOR UPDATE`);
      const latest=await tx.$queryRaw<Array<{version:number}>>(Prisma.sql`
        SELECT "version" FROM "GovernanceElectionPolicyRevision"
        WHERE "societyId"=${societyId}::uuid ORDER BY "version" DESC LIMIT 1
      `);
      const version=(latest[0]?.version??0)+1;
      const rows=await tx.$queryRaw<PolicyRow[]>(Prisma.sql`
        INSERT INTO "GovernanceElectionPolicyRevision"
          ("societyId","version","enabled","eligibilityMode","policyReference","note","createdByUserId")
        VALUES
          (${societyId}::uuid,${version},${dto.enabled},${dto.eligibilityMode},${reference},${dto.note?.trim()||null},${actor}::uuid)
        RETURNING "id","version","enabled","eligibilityMode","policyReference","note","createdByUserId","createdAt"
      `);
      return rows[0];
    });
  }

  @Get('electorate-snapshots')
  @RequiresPermissions(AppPermission.GOVERNANCE_READ)
  listSnapshots(@CurrentTenant() societyId:string){
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT s."id",s."policyRevisionId",p."version" AS "policyVersion",p."eligibilityMode",p."policyReference",
        s."createdByUserId",s."createdAt",COUNT(m."id")::int AS "memberCount"
      FROM "GovernanceElectorateSnapshot" s
      JOIN "GovernanceElectionPolicyRevision" p ON p."id"=s."policyRevisionId" AND p."societyId"=s."societyId"
      LEFT JOIN "GovernanceElectorateMember" m ON m."snapshotId"=s."id" AND m."societyId"=s."societyId"
      WHERE s."societyId"=${societyId}::uuid
      GROUP BY s."id",p."id" ORDER BY s."createdAt" DESC
    `);
  }

  @Get('electorate-snapshots/:id')
  @RequiresPermissions(AppPermission.GOVERNANCE_READ)
  async getSnapshot(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string){
    const snapshots=await this.prisma.$queryRaw<Array<SnapshotRow&{policyVersion:number;eligibilityMode:EligibilityMode;policyReference:string}>>(Prisma.sql`
      SELECT s."id",s."policyRevisionId",s."createdByUserId",s."createdAt",p."version" AS "policyVersion",p."eligibilityMode",p."policyReference"
      FROM "GovernanceElectorateSnapshot" s
      JOIN "GovernanceElectionPolicyRevision" p ON p."id"=s."policyRevisionId" AND p."societyId"=s."societyId"
      WHERE s."id"=${id}::uuid AND s."societyId"=${societyId}::uuid LIMIT 1
    `);
    if(!snapshots.length)throw new BadRequestException('Electorate snapshot not found');
    const members=await this.prisma.$queryRaw(Prisma.sql`
      SELECT "id","unitId","userId","eligibilitySource","sourceRelationshipId","ownershipBps","occupancyRelation","createdAt"
      FROM "GovernanceElectorateMember"
      WHERE "snapshotId"=${id}::uuid AND "societyId"=${societyId}::uuid
      ORDER BY "unitId","userId"
    `);
    return {...snapshots[0],members};
  }

  @Post('electorate-snapshots')
  @RequiresPermissions(AppPermission.GOVERNANCE_MANAGE)
  async createSnapshot(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined){
    const actor=this.user(userId);
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Society" WHERE "id"=${societyId}::uuid FOR UPDATE`);
      const policies=await tx.$queryRaw<PolicyRow[]>(Prisma.sql`
        SELECT "id","version","enabled","eligibilityMode","policyReference","note","createdByUserId","createdAt"
        FROM "GovernanceElectionPolicyRevision"
        WHERE "societyId"=${societyId}::uuid ORDER BY "version" DESC LIMIT 1
      `);
      if(!policies.length)throw new ConflictException('Election policy is not configured');
      const policy=policies[0];
      if(!policy.enabled)throw new ConflictException('Election policy is disabled for this society');
      if(policy.createdByUserId===actor)throw new ConflictException('Electorate snapshot must be created by a different governance actor than the active policy revision');
      const snapshots=await tx.$queryRaw<SnapshotRow[]>(Prisma.sql`
        INSERT INTO "GovernanceElectorateSnapshot" ("societyId","policyRevisionId","createdByUserId")
        VALUES (${societyId}::uuid,${policy.id}::uuid,${actor}::uuid)
        RETURNING "id","policyRevisionId","createdByUserId","createdAt"
      `);
      const snapshot=snapshots[0];
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "GovernanceElectorateMember"
          ("snapshotId","societyId","unitId","userId","eligibilitySource","sourceRelationshipId","ownershipBps")
        SELECT ${snapshot.id}::uuid,o."societyId",o."unitId",o."userId",'VERIFIED_OWNER',o."id",o."ownershipBps"
        FROM "UnitOwnership" o
        WHERE o."societyId"=${societyId}::uuid AND o."active"=TRUE AND o."verified"=TRUE
          AND o."effectiveFrom"<=CURRENT_TIMESTAMP AND (o."effectiveTo" IS NULL OR o."effectiveTo">CURRENT_TIMESTAMP)
      `);
      if(policy.eligibilityMode==='VERIFIED_OWNERS_AND_ACTIVE_OCCUPANTS'){
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "GovernanceElectorateMember"
            ("snapshotId","societyId","unitId","userId","eligibilitySource","sourceRelationshipId","occupancyRelation")
          SELECT ${snapshot.id}::uuid,o."societyId",o."unitId",o."userId",'ACTIVE_OCCUPANT',o."id",o."relation"::text
          FROM "UnitOccupancy" o
          WHERE o."societyId"=${societyId}::uuid AND o."active"=TRUE
            AND o."effectiveFrom"<=CURRENT_TIMESTAMP AND (o."effectiveTo" IS NULL OR o."effectiveTo">CURRENT_TIMESTAMP)
          ON CONFLICT ("snapshotId","unitId","userId") DO NOTHING
        `);
      }
      const count=await tx.$queryRaw<Array<{memberCount:number}>>(Prisma.sql`
        SELECT COUNT(*)::int AS "memberCount" FROM "GovernanceElectorateMember" WHERE "snapshotId"=${snapshot.id}::uuid
      `);
      return {...snapshot,policyVersion:policy.version,eligibilityMode:policy.eligibilityMode,policyReference:policy.policyReference,memberCount:count[0]?.memberCount??0,ballotCastingEnabled:false};
    });
  }

  private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated user is required');return userId;}
}
