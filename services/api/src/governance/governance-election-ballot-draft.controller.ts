import { BadRequestException, Body, ConflictException, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
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
type ReviewOutcome='REVIEWED'|'BLOCKED';

type SnapshotSetupRow={
  snapshotId:string;
  snapshotCreatedByUserId:string;
  policyRevisionId:string;
  policyVersion:number;
  policyReference:string;
};

type ReviewRow={id:string;snapshotId:string;outcome:ReviewOutcome;note:string|null;createdByUserId:string;createdAt:Date};
type DraftRow={id:string;snapshotId:string;title:string;question:string;status:'DRAFT';createdByUserId:string;createdAt:Date};

class RecordElectorateReviewDto{
  @IsIn(['REVIEWED','BLOCKED']) outcome!:ReviewOutcome;
  @IsOptional() @IsString() @MaxLength(2000) note?:string;
}

class CreateBallotDraftDto{
  @IsString() @MinLength(1) @MaxLength(240) title!:string;
  @IsString() @MinLength(1) @MaxLength(2000) question!:string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(20) @IsString({each:true}) options!:string[];
}

@Controller('governance/elections')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.GOVERNANCE_POLLS)
export class GovernanceElectionBallotDraftController{
  constructor(private readonly prisma:PrismaService){}

  @Get('electorate-snapshots/:id/reviews')
  @RequiresPermissions(AppPermission.GOVERNANCE_READ)
  listReviews(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) snapshotId:string){
    return this.prisma.$queryRaw<ReviewRow[]>(Prisma.sql`
      SELECT r."id",r."snapshotId",r."outcome",r."note",r."createdByUserId",r."createdAt"
      FROM "GovernanceElectorateReviewAttestation" r
      WHERE r."societyId"=${societyId}::uuid AND r."snapshotId"=${snapshotId}::uuid
      ORDER BY r."createdAt" DESC,r."id" DESC
    `);
  }

  @Post('electorate-snapshots/:id/reviews')
  @RequiresPermissions(AppPermission.GOVERNANCE_MANAGE)
  async recordReview(
    @CurrentTenant() societyId:string,
    @CurrentUser() userId:string|undefined,
    @Param('id',new ParseUUIDPipe()) snapshotId:string,
    @Body() dto:RecordElectorateReviewDto,
  ){
    const actor=this.user(userId);
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Society" WHERE "id"=${societyId}::uuid FOR UPDATE`);
      const setup=await this.currentSnapshot(tx,societyId,snapshotId);
      if(setup.snapshotCreatedByUserId===actor)throw new ConflictException('Electorate review must be recorded by a different governance actor than the snapshot creator');
      const rows=await tx.$queryRaw<ReviewRow[]>(Prisma.sql`
        INSERT INTO "GovernanceElectorateReviewAttestation"
          ("societyId","snapshotId","outcome","note","createdByUserId")
        VALUES
          (${societyId}::uuid,${snapshotId}::uuid,${dto.outcome},${dto.note?.trim()||null},${actor}::uuid)
        RETURNING "id","snapshotId","outcome","note","createdByUserId","createdAt"
      `);
      return {...rows[0],policyVersion:setup.policyVersion,policyReference:setup.policyReference};
    });
  }

  @Get('ballot-drafts')
  @RequiresPermissions(AppPermission.GOVERNANCE_READ)
  async listDrafts(@CurrentTenant() societyId:string){
    const drafts=await this.prisma.$queryRaw<Array<DraftRow&{policyVersion:number;policyReference:string}>>(Prisma.sql`
      SELECT d."id",d."snapshotId",d."title",d."question",d."status",d."createdByUserId",d."createdAt",
        p."version" AS "policyVersion",p."policyReference"
      FROM "GovernanceElectionBallotDraft" d
      JOIN "GovernanceElectorateSnapshot" s ON s."id"=d."snapshotId" AND s."societyId"=d."societyId"
      JOIN "GovernanceElectionPolicyRevision" p ON p."id"=s."policyRevisionId" AND p."societyId"=d."societyId"
      WHERE d."societyId"=${societyId}::uuid
      ORDER BY d."createdAt" DESC,d."id" DESC
    `);
    return Promise.all(drafts.map(async draft=>({...draft,options:await this.options(draft.id,societyId),executable:false,castingEnabled:false})));
  }

  @Get('ballot-drafts/:id')
  @RequiresPermissions(AppPermission.GOVERNANCE_READ)
  async getDraft(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string){
    const drafts=await this.prisma.$queryRaw<Array<DraftRow&{policyVersion:number;policyReference:string}>>(Prisma.sql`
      SELECT d."id",d."snapshotId",d."title",d."question",d."status",d."createdByUserId",d."createdAt",
        p."version" AS "policyVersion",p."policyReference"
      FROM "GovernanceElectionBallotDraft" d
      JOIN "GovernanceElectorateSnapshot" s ON s."id"=d."snapshotId" AND s."societyId"=d."societyId"
      JOIN "GovernanceElectionPolicyRevision" p ON p."id"=s."policyRevisionId" AND p."societyId"=d."societyId"
      WHERE d."id"=${id}::uuid AND d."societyId"=${societyId}::uuid LIMIT 1
    `);
    if(!drafts.length)throw new BadRequestException('Ballot draft not found');
    return {...drafts[0],options:await this.options(id,societyId),executable:false,castingEnabled:false};
  }

  @Post('electorate-snapshots/:id/ballot-drafts')
  @RequiresPermissions(AppPermission.GOVERNANCE_MANAGE)
  async createDraft(
    @CurrentTenant() societyId:string,
    @CurrentUser() userId:string|undefined,
    @Param('id',new ParseUUIDPipe()) snapshotId:string,
    @Body() dto:CreateBallotDraftDto,
  ){
    const actor=this.user(userId),title=dto.title.trim(),question=dto.question.trim(),options=dto.options.map(v=>v.trim());
    if(!title||!question)throw new BadRequestException('Ballot title and question are required');
    if(options.some(v=>!v))throw new BadRequestException('Ballot option labels cannot be empty');
    if(new Set(options.map(v=>v.toLocaleLowerCase('en-IN'))).size!==options.length)throw new BadRequestException('Ballot option labels must be unique');
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Society" WHERE "id"=${societyId}::uuid FOR UPDATE`);
      const setup=await this.currentSnapshot(tx,societyId,snapshotId);
      const reviews=await tx.$queryRaw<ReviewRow[]>(Prisma.sql`
        SELECT "id","snapshotId","outcome","note","createdByUserId","createdAt"
        FROM "GovernanceElectorateReviewAttestation"
        WHERE "societyId"=${societyId}::uuid AND "snapshotId"=${snapshotId}::uuid
        ORDER BY "createdAt" DESC,"id" DESC LIMIT 1
      `);
      if(!reviews.length)throw new ConflictException('Electorate review is required before creating a ballot draft');
      const review=reviews[0];
      if(review.outcome!=='REVIEWED')throw new ConflictException('Latest electorate review blocks ballot draft creation');
      if(review.createdByUserId===actor)throw new ConflictException('Ballot draft must be created by a different governance actor than the electorate reviewer');
      if(setup.snapshotCreatedByUserId===actor)throw new ConflictException('Ballot draft must be created by a different governance actor than the snapshot creator');
      const drafts=await tx.$queryRaw<DraftRow[]>(Prisma.sql`
        INSERT INTO "GovernanceElectionBallotDraft"
          ("societyId","snapshotId","title","question","createdByUserId")
        VALUES
          (${societyId}::uuid,${snapshotId}::uuid,${title},${question},${actor}::uuid)
        RETURNING "id","snapshotId","title","question","status","createdByUserId","createdAt"
      `);
      const draft=drafts[0];
      for(let i=0;i<options.length;i++){
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "GovernanceElectionBallotDraftOption" ("societyId","ballotDraftId","ordinal","label")
          VALUES (${societyId}::uuid,${draft.id}::uuid,${i+1},${options[i]})
        `);
      }
      return {...draft,options:options.map((label,index)=>({ordinal:index+1,label})),policyVersion:setup.policyVersion,policyReference:setup.policyReference,executable:false,castingEnabled:false};
    });
  }

  private async currentSnapshot(tx:Prisma.TransactionClient,societyId:string,snapshotId:string){
    const rows=await tx.$queryRaw<SnapshotSetupRow[]>(Prisma.sql`
      SELECT s."id" AS "snapshotId",s."createdByUserId" AS "snapshotCreatedByUserId",s."policyRevisionId",
        p."version" AS "policyVersion",p."policyReference"
      FROM "GovernanceElectorateSnapshot" s
      JOIN "GovernanceElectionPolicyRevision" p ON p."id"=s."policyRevisionId" AND p."societyId"=s."societyId"
      WHERE s."id"=${snapshotId}::uuid AND s."societyId"=${societyId}::uuid AND p."enabled"=TRUE
        AND NOT EXISTS (
          SELECT 1 FROM "GovernanceElectionPolicyRevision" newer
          WHERE newer."societyId"=s."societyId" AND newer."version">p."version"
        )
      LIMIT 1
    `);
    if(!rows.length)throw new ConflictException('Electorate snapshot is not bound to the current enabled election policy');
    return rows[0];
  }

  private options(ballotDraftId:string,societyId:string){
    return this.prisma.$queryRaw<Array<{ordinal:number;label:string}>>(Prisma.sql`
      SELECT "ordinal","label" FROM "GovernanceElectionBallotDraftOption"
      WHERE "ballotDraftId"=${ballotDraftId}::uuid AND "societyId"=${societyId}::uuid ORDER BY "ordinal"
    `);
  }

  private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated user is required');return userId;}
}
