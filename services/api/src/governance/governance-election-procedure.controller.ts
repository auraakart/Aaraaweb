import { BadRequestException, Body, ConflictException, Controller, ExecutionContext, Get, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
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

type ProcedureRow={
  id:string;policyRevisionId:string;version:number;jointOwnershipReference:string;proxyReference:string;voteBasisReference:string;
  quorumReference:string;secrecyReference:string;challengeReference:string;recountReference:string;certificationReference:string;
  resultPublicationReference:string;createdByUserId:string;createdAt:Date;
};

class RecordElectionProcedureDto{
  @IsString() @MinLength(1) @MaxLength(2000) jointOwnershipReference!:string;
  @IsString() @MinLength(1) @MaxLength(2000) proxyReference!:string;
  @IsString() @MinLength(1) @MaxLength(2000) voteBasisReference!:string;
  @IsString() @MinLength(1) @MaxLength(2000) quorumReference!:string;
  @IsString() @MinLength(1) @MaxLength(2000) secrecyReference!:string;
  @IsString() @MinLength(1) @MaxLength(2000) challengeReference!:string;
  @IsString() @MinLength(1) @MaxLength(2000) recountReference!:string;
  @IsString() @MinLength(1) @MaxLength(2000) certificationReference!:string;
  @IsString() @MinLength(1) @MaxLength(2000) resultPublicationReference!:string;
}

@Controller('governance/elections/procedure')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.GOVERNANCE_POLLS)
export class GovernanceElectionProcedureController{
  constructor(private readonly prisma:PrismaService){}

  @Get()
  @RequiresPermissions(AppPermission.GOVERNANCE_READ)
  async current(@CurrentTenant() societyId:string){
    const rows=await this.prisma.$queryRaw<ProcedureRow[]>(Prisma.sql`
      SELECT r."id",r."policyRevisionId",r."version",r."jointOwnershipReference",r."proxyReference",r."voteBasisReference",
        r."quorumReference",r."secrecyReference",r."challengeReference",r."recountReference",r."certificationReference",
        r."resultPublicationReference",r."createdByUserId",r."createdAt"
      FROM "GovernanceElectionProcedureRevision" r
      JOIN "GovernanceElectionPolicyRevision" p ON p."id"=r."policyRevisionId" AND p."societyId"=r."societyId"
      WHERE r."societyId"=${societyId}::uuid AND p."enabled"=TRUE
        AND NOT EXISTS (SELECT 1 FROM "GovernanceElectionPolicyRevision" newer WHERE newer."societyId"=p."societyId" AND newer."version">p."version")
      ORDER BY r."version" DESC LIMIT 1
    `);
    return rows.length?{...rows[0],executionEnabled:false,castingEnabled:false}:{configured:false,executionEnabled:false,castingEnabled:false};
  }

  @Post('revisions')
  @RequiresPermissions(AppPermission.GOVERNANCE_MANAGE)
  async record(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:RecordElectionProcedureDto){
    const actor=this.user(userId),references=this.references(dto);
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Society" WHERE "id"=${societyId}::uuid FOR UPDATE`);
      const policies=await tx.$queryRaw<Array<{id:string;version:number;createdByUserId:string}>>(Prisma.sql`
        SELECT "id","version","createdByUserId" FROM "GovernanceElectionPolicyRevision"
        WHERE "societyId"=${societyId}::uuid AND "enabled"=TRUE ORDER BY "version" DESC LIMIT 1
      `);
      if(!policies.length)throw new ConflictException('Current enabled election policy is required');
      const policy=policies[0];
      if(policy.createdByUserId===actor)throw new ConflictException('Election procedure revision must be recorded by a different governance actor than the current policy creator');
      const latest=await tx.$queryRaw<Array<{version:number}>>(Prisma.sql`
        SELECT "version" FROM "GovernanceElectionProcedureRevision"
        WHERE "societyId"=${societyId}::uuid AND "policyRevisionId"=${policy.id}::uuid ORDER BY "version" DESC LIMIT 1
      `);
      const version=(latest[0]?.version??0)+1;
      const rows=await tx.$queryRaw<ProcedureRow[]>(Prisma.sql`
        INSERT INTO "GovernanceElectionProcedureRevision" (
          "societyId","policyRevisionId","version","jointOwnershipReference","proxyReference","voteBasisReference",
          "quorumReference","secrecyReference","challengeReference","recountReference","certificationReference",
          "resultPublicationReference","createdByUserId"
        ) VALUES (
          ${societyId}::uuid,${policy.id}::uuid,${version},${references.jointOwnershipReference},${references.proxyReference},${references.voteBasisReference},
          ${references.quorumReference},${references.secrecyReference},${references.challengeReference},${references.recountReference},${references.certificationReference},
          ${references.resultPublicationReference},${actor}::uuid
        ) RETURNING "id","policyRevisionId","version","jointOwnershipReference","proxyReference","voteBasisReference","quorumReference",
          "secrecyReference","challengeReference","recountReference","certificationReference","resultPublicationReference","createdByUserId","createdAt"
      `);
      return {...rows[0],policyVersion:policy.version,executionEnabled:false,castingEnabled:false};
    });
  }

  private references(dto:RecordElectionProcedureDto){
    const result={
      jointOwnershipReference:dto.jointOwnershipReference.trim(),proxyReference:dto.proxyReference.trim(),voteBasisReference:dto.voteBasisReference.trim(),
      quorumReference:dto.quorumReference.trim(),secrecyReference:dto.secrecyReference.trim(),challengeReference:dto.challengeReference.trim(),
      recountReference:dto.recountReference.trim(),certificationReference:dto.certificationReference.trim(),resultPublicationReference:dto.resultPublicationReference.trim(),
    };
    if(Object.values(result).some(v=>!v))throw new BadRequestException('All election procedure references are required; record explicit non-applicability where the society policy permits it');
    return result;
  }

  private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated user is required');return userId;}
}
