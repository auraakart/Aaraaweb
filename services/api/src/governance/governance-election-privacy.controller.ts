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

type PrivacyRow={
  id:string;policyRevisionId:string;version:number;identitySeparationReference:string;secrecyImplementationReference:string;
  credentialIssuanceReference:string;privilegedAuditAccessReference:string;retentionReference:string;incidentResponseReference:string;
  createdByUserId:string;createdAt:Date;
};

class RecordElectionPrivacyArchitectureDto{
  @IsString() @MinLength(1) @MaxLength(2000) identitySeparationReference!:string;
  @IsString() @MinLength(1) @MaxLength(2000) secrecyImplementationReference!:string;
  @IsString() @MinLength(1) @MaxLength(2000) credentialIssuanceReference!:string;
  @IsString() @MinLength(1) @MaxLength(2000) privilegedAuditAccessReference!:string;
  @IsString() @MinLength(1) @MaxLength(2000) retentionReference!:string;
  @IsString() @MinLength(1) @MaxLength(2000) incidentResponseReference!:string;
}

@Controller('governance/elections/privacy-architecture')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.GOVERNANCE_POLLS)
export class GovernanceElectionPrivacyController{
  constructor(private readonly prisma:PrismaService){}

  @Get()
  @RequiresPermissions(AppPermission.GOVERNANCE_READ)
  async current(@CurrentTenant() societyId:string){
    const rows=await this.prisma.$queryRaw<PrivacyRow[]>(Prisma.sql`
      SELECT r."id",r."policyRevisionId",r."version",r."identitySeparationReference",r."secrecyImplementationReference",
        r."credentialIssuanceReference",r."privilegedAuditAccessReference",r."retentionReference",r."incidentResponseReference",
        r."createdByUserId",r."createdAt"
      FROM "GovernanceElectionPrivacyArchitectureRevision" r
      JOIN "GovernanceElectionPolicyRevision" p ON p."id"=r."policyRevisionId" AND p."societyId"=r."societyId"
      WHERE r."societyId"=${societyId}::uuid AND p."enabled"=TRUE
        AND NOT EXISTS (SELECT 1 FROM "GovernanceElectionPolicyRevision" newer WHERE newer."societyId"=p."societyId" AND newer."version">p."version")
      ORDER BY r."version" DESC LIMIT 1
    `);
    return rows.length?{...rows[0],architectureConfigured:true,executionEnabled:false,castingEnabled:false}:{configured:false,architectureConfigured:false,executionEnabled:false,castingEnabled:false};
  }

  @Post('revisions')
  @RequiresPermissions(AppPermission.GOVERNANCE_MANAGE)
  async record(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:RecordElectionPrivacyArchitectureDto){
    const actor=this.user(userId),references=this.references(dto);
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Society" WHERE "id"=${societyId}::uuid FOR UPDATE`);
      const policies=await tx.$queryRaw<Array<{id:string;version:number;createdByUserId:string}>>(Prisma.sql`
        SELECT "id","version","createdByUserId" FROM "GovernanceElectionPolicyRevision"
        WHERE "societyId"=${societyId}::uuid AND "enabled"=TRUE ORDER BY "version" DESC LIMIT 1
      `);
      if(!policies.length)throw new ConflictException('Current enabled election policy is required');
      const policy=policies[0];
      const procedures=await tx.$queryRaw<Array<{id:string;version:number;createdByUserId:string}>>(Prisma.sql`
        SELECT "id","version","createdByUserId" FROM "GovernanceElectionProcedureRevision"
        WHERE "societyId"=${societyId}::uuid AND "policyRevisionId"=${policy.id}::uuid ORDER BY "version" DESC LIMIT 1
      `);
      if(!procedures.length)throw new ConflictException('Current election procedure policy is required before privacy architecture evidence');
      if(policy.createdByUserId===actor)throw new ConflictException('Election privacy architecture must be recorded by a different governance actor than the current policy creator');
      if(procedures[0].createdByUserId===actor)throw new ConflictException('Election privacy architecture must be recorded by a different governance actor than the current procedure-policy creator');
      const latest=await tx.$queryRaw<Array<{version:number}>>(Prisma.sql`
        SELECT "version" FROM "GovernanceElectionPrivacyArchitectureRevision"
        WHERE "societyId"=${societyId}::uuid AND "policyRevisionId"=${policy.id}::uuid ORDER BY "version" DESC LIMIT 1
      `);
      const version=(latest[0]?.version??0)+1;
      const rows=await tx.$queryRaw<PrivacyRow[]>(Prisma.sql`
        INSERT INTO "GovernanceElectionPrivacyArchitectureRevision" (
          "societyId","policyRevisionId","version","identitySeparationReference","secrecyImplementationReference",
          "credentialIssuanceReference","privilegedAuditAccessReference","retentionReference","incidentResponseReference","createdByUserId"
        ) VALUES (
          ${societyId}::uuid,${policy.id}::uuid,${version},${references.identitySeparationReference},${references.secrecyImplementationReference},
          ${references.credentialIssuanceReference},${references.privilegedAuditAccessReference},${references.retentionReference},${references.incidentResponseReference},${actor}::uuid
        ) RETURNING "id","policyRevisionId","version","identitySeparationReference","secrecyImplementationReference","credentialIssuanceReference",
          "privilegedAuditAccessReference","retentionReference","incidentResponseReference","createdByUserId","createdAt"
      `);
      return {...rows[0],policyVersion:policy.version,procedureVersion:procedures[0].version,architectureConfigured:true,executionEnabled:false,castingEnabled:false};
    });
  }

  private references(dto:RecordElectionPrivacyArchitectureDto){
    const result={
      identitySeparationReference:dto.identitySeparationReference.trim(),
      secrecyImplementationReference:dto.secrecyImplementationReference.trim(),
      credentialIssuanceReference:dto.credentialIssuanceReference.trim(),
      privilegedAuditAccessReference:dto.privilegedAuditAccessReference.trim(),
      retentionReference:dto.retentionReference.trim(),
      incidentResponseReference:dto.incidentResponseReference.trim(),
    };
    if(Object.values(result).some(v=>!v))throw new BadRequestException('All election privacy architecture references are required');
    return result;
  }

  private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated user is required');return userId;}
}
