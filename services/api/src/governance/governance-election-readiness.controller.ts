import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { BearerGuard } from '../auth/bearer.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { PrismaService } from '../prisma/prisma.service';

type ReadinessRow={
  ballotDraftId:string;
  snapshotId:string;
  policyRevisionId:string;
  policyVersion:number;
  policyEnabled:boolean;
  policyCurrent:boolean;
  procedureRevisionId:string|null;
  procedureVersion:number|null;
  reviewOutcome:'REVIEWED'|'BLOCKED'|null;
  reviewSequence:number|null;
  decisionOutcome:'APPROVED'|'REJECTED'|'CANCELLED'|null;
  decisionSequence:number|null;
};

@Controller('governance/elections/readiness')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.GOVERNANCE_POLLS)
export class GovernanceElectionReadinessController{
  constructor(private readonly prisma:PrismaService){}

  @Get('ballot-drafts/:id')
  @RequiresPermissions(AppPermission.GOVERNANCE_READ)
  async assess(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) ballotDraftId:string){
    const rows=await this.prisma.$queryRaw<ReadinessRow[]>(Prisma.sql`
      SELECT d."id" AS "ballotDraftId",d."snapshotId",s."policyRevisionId",p."version" AS "policyVersion",p."enabled" AS "policyEnabled",
        (p."enabled"=TRUE AND NOT EXISTS(
          SELECT 1 FROM "GovernanceElectionPolicyRevision" newer
          WHERE newer."societyId"=p."societyId" AND newer."version">p."version"
        )) AS "policyCurrent",
        procedure."id" AS "procedureRevisionId",procedure."version" AS "procedureVersion",
        review."outcome" AS "reviewOutcome",review."sequence" AS "reviewSequence",
        decision."outcome" AS "decisionOutcome",decision."sequence" AS "decisionSequence"
      FROM "GovernanceElectionBallotDraft" d
      JOIN "GovernanceElectorateSnapshot" s ON s."id"=d."snapshotId" AND s."societyId"=d."societyId"
      JOIN "GovernanceElectionPolicyRevision" p ON p."id"=s."policyRevisionId" AND p."societyId"=d."societyId"
      LEFT JOIN LATERAL (
        SELECT r."id",r."version" FROM "GovernanceElectionProcedureRevision" r
        WHERE r."societyId"=d."societyId" AND r."policyRevisionId"=p."id"
        ORDER BY r."version" DESC LIMIT 1
      ) procedure ON TRUE
      LEFT JOIN LATERAL (
        SELECT r."outcome",r."sequence" FROM "GovernanceElectorateReviewAttestation" r
        WHERE r."societyId"=d."societyId" AND r."snapshotId"=s."id"
        ORDER BY r."sequence" DESC LIMIT 1
      ) review ON TRUE
      LEFT JOIN LATERAL (
        SELECT x."outcome",x."sequence" FROM "GovernanceElectionBallotDraftDecision" x
        WHERE x."societyId"=d."societyId" AND x."ballotDraftId"=d."id"
        ORDER BY x."sequence" DESC LIMIT 1
      ) decision ON TRUE
      WHERE d."id"=${ballotDraftId}::uuid AND d."societyId"=${societyId}::uuid LIMIT 1
    `);
    if(!rows.length)throw new BadRequestException('Ballot draft not found');
    const row=rows[0];
    const checks={
      currentEnabledPolicy:row.policyEnabled&&row.policyCurrent,
      snapshotBoundToCurrentPolicy:row.policyCurrent,
      electorateReviewed:row.reviewOutcome==='REVIEWED',
      procedureConfigured:!!row.procedureRevisionId,
      ballotApproved:row.decisionOutcome==='APPROVED',
      ballotNotCancelled:row.decisionOutcome!=='CANCELLED',
    };
    const blockers:string[]=[];
    if(!checks.currentEnabledPolicy)blockers.push('CURRENT_ENABLED_POLICY_REQUIRED');
    if(!checks.snapshotBoundToCurrentPolicy)blockers.push('CURRENT_POLICY_SNAPSHOT_REQUIRED');
    if(!checks.electorateReviewed)blockers.push('ELECTORATE_REVIEW_REQUIRED');
    if(!checks.procedureConfigured)blockers.push('PROCEDURE_POLICY_REQUIRED');
    if(!checks.ballotApproved)blockers.push(row.decisionOutcome==='CANCELLED'?'BALLOT_CANCELLED':'BALLOT_APPROVAL_REQUIRED');
    const configurationReady=blockers.length===0;
    return {
      ballotDraftId:row.ballotDraftId,
      snapshotId:row.snapshotId,
      policyRevisionId:row.policyRevisionId,
      policyVersion:row.policyVersion,
      procedureRevisionId:row.procedureRevisionId,
      procedureVersion:row.procedureVersion,
      reviewOutcome:row.reviewOutcome,
      reviewSequence:row.reviewSequence,
      decisionOutcome:row.decisionOutcome,
      decisionSequence:row.decisionSequence,
      checks,
      blockers,
      configurationReady,
      executionEnabled:false,
      castingEnabled:false,
    };
  }
}
