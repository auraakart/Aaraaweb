import { Injectable } from '@nestjs/common';
import { MembershipRole, Prisma } from '@prisma/client';
import { EntitlementService } from '../entitlements/entitlement.service';
import { ProductFeature } from '../entitlements/entitlement.types';
import { PrismaService } from '../prisma/prisma.service';
import { MigrationBatchService } from './migration-batch.service';

type StepState='READY'|'IN_PROGRESS'|'REVIEW';
type OnboardingStep={
  id:string;
  title:string;
  description:string;
  href:string;
  state:StepState;
  evidence:string;
  blockers:string[];
  nextActions:string[];
};

type Snapshot={
  auditorAssignments:number;
  accessConfigured:boolean;
  paymentConfigured:boolean;
  activeAmenities:number;
  openAccountingPeriods:number;
  activeCommitteeTenures:number;
  governanceMeetings:number;
  eligibleResidents:number;
  activatedResidents:number;
  evaluatedAt:Date;
};

const OPERATIONAL_ROLES=[
  MembershipRole.COMMITTEE_MEMBER,
  MembershipRole.FACILITY_MANAGER,
  MembershipRole.ACCOUNTANT,
  MembershipRole.SECURITY_SUPERVISOR,
  MembershipRole.SECURITY_GUARD,
  MembershipRole.STAFF,
] as const;

@Injectable()
export class OnboardingReadinessService{
  constructor(
    private readonly prisma:PrismaService,
    private readonly migration:MigrationBatchService,
    private readonly entitlements:EntitlementService,
  ){}

  async readiness(societyId:string){
    const [migration,buildingCount,operationalRoleCount,entitlements,snapshotRows]=await Promise.all([
      this.migration.readiness(societyId),
      this.prisma.building.count({where:{societyId}}),
      this.prisma.societyMembership.count({where:{societyId,active:true,role:{in:[...OPERATIONAL_ROLES]}}}),
      this.entitlements.current(societyId),
      this.prisma.$queryRaw<Snapshot[]>(Prisma.sql`
        SELECT
          (SELECT COUNT(*)::int FROM "SocietyResponsibilityAssignment"
            WHERE "societyId"=${societyId}::uuid AND "responsibility"='READ_ONLY_AUDITOR' AND "active"=TRUE) AS "auditorAssignments",
          EXISTS(SELECT 1 FROM "SocietyIntegrationConfiguration"
            WHERE "societyId"=${societyId}::uuid AND "family"='ACCESS_CONTROL' AND "enabled"=TRUE) AS "accessConfigured",
          EXISTS(SELECT 1 FROM "SocietyIntegrationConfiguration"
            WHERE "societyId"=${societyId}::uuid AND "family"='PAYMENT_GATEWAY' AND "enabled"=TRUE) AS "paymentConfigured",
          (SELECT COUNT(*)::int FROM "Amenity"
            WHERE "societyId"=${societyId}::uuid AND "active"=TRUE) AS "activeAmenities",
          (SELECT COUNT(*)::int FROM "AccountingPeriod"
            WHERE "societyId"=${societyId}::uuid AND "status"='OPEN') AS "openAccountingPeriods",
          (SELECT COUNT(*)::int FROM "GovernanceCommitteeTenure"
            WHERE "societyId"=${societyId}::uuid AND "effectiveFrom"<=CURRENT_TIMESTAMP
              AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP)) AS "activeCommitteeTenures",
          (SELECT COUNT(*)::int FROM "GovernanceMeeting"
            WHERE "societyId"=${societyId}::uuid) AS "governanceMeetings",
          (SELECT COUNT(*)::int FROM (
            SELECT DISTINCT "userId" FROM "UnitOccupancy"
              WHERE "societyId"=${societyId}::uuid AND "active"=TRUE
                AND "effectiveFrom"<=CURRENT_TIMESTAMP AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP)
            UNION
            SELECT DISTINCT "userId" FROM "UnitOwnership"
              WHERE "societyId"=${societyId}::uuid AND "active"=TRUE AND "verified"=TRUE
                AND "effectiveFrom"<=CURRENT_TIMESTAMP AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP)
          ) eligible) AS "eligibleResidents",
          (SELECT COUNT(*)::int FROM (
            SELECT DISTINCT "userId" FROM "UnitOccupancy"
              WHERE "societyId"=${societyId}::uuid AND "active"=TRUE
                AND "effectiveFrom"<=CURRENT_TIMESTAMP AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP)
            UNION
            SELECT DISTINCT "userId" FROM "UnitOwnership"
              WHERE "societyId"=${societyId}::uuid AND "active"=TRUE AND "verified"=TRUE
                AND "effectiveFrom"<=CURRENT_TIMESTAMP AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP)
          ) eligible
          WHERE EXISTS (
            SELECT 1 FROM "Session" session
            WHERE session."societyId"=${societyId}::uuid AND session."userId"=eligible."userId"
          )) AS "activatedResidents",
          CURRENT_TIMESTAMP AS "evaluatedAt"
      `),
    ]);

    const snapshot=snapshotRows[0]??{
      auditorAssignments:0,accessConfigured:false,paymentConfigured:false,activeAmenities:0,
      openAccountingPeriods:0,activeCommitteeTenures:0,governanceMeetings:0,eligibleResidents:0,activatedResidents:0,evaluatedAt:new Date(0),
    };
    const features=new Set(entitlements?.enabledFeatures??[]);
    const amenitiesEnabled=features.has(ProductFeature.AMENITIES);
    const accountingEnabled=features.has(ProductFeature.SOCIETY_ACCOUNTING);
    const paymentsEnabled=features.has(ProductFeature.PAYMENTS);
    const rolesCount=operationalRoleCount+snapshot.auditorAssignments;
    const activationPercent=snapshot.eligibleResidents>0?Math.round((snapshot.activatedResidents/snapshot.eligibleResidents)*1000)/10:null;

    const migrationBlockers=migration.stages.flatMap(stage=>stage.blockers.map(blocker=>`${stage.entityType}: ${blocker}`));
    const migrationState:StepState=migration.complete?'READY':migration.blockedStages>0?'IN_PROGRESS':migration.readyStages>0?'REVIEW':'IN_PROGRESS';

    const steps:OnboardingStep[]=[
      {
        id:'property',title:'1. Property structure',
        description:'Create buildings, floors and units, or migrate them through the canonical import flow.',
        href:'/property',state:buildingCount>0?'READY':'IN_PROGRESS',
        evidence:buildingCount>0?`${buildingCount} building/block record(s) available`:'No building/block is configured yet',
        blockers:buildingCount>0?[]:['PROPERTY_STRUCTURE_MISSING'],
        nextActions:buildingCount>0?[]:['Create the first building/block or stage the BUILDING migration batch.'],
      },
      {
        id:'migration',title:'2. Data migration',
        description:'Complete canonical migration stages in dependency order using preview, dry-run evidence and explicit commit.',
        href:'/migration',state:migrationState,
        evidence:`${migration.committedStages}/${migration.totalStages} canonical stages committed${migration.nextStage?` · next ${migration.nextStage}`:''}`,
        blockers:migrationBlockers,
        nextActions:migration.complete?[]:migration.readyStages>0
          ?['Review the READY migration batch evidence and explicitly commit the next dependency-safe stage.']
          :['Stage and validate the next migration entity before committing downstream dependencies.'],
      },
      {
        id:'roles',title:'3. People & operational roles',
        description:'Assign operational responsibilities without changing owner/tenant relationship authority.',
        href:'/roles',state:rolesCount>0?'READY':'IN_PROGRESS',
        evidence:`${rolesCount} active operational/audit assignment(s)`,
        blockers:rolesCount>0?[]:['OPERATIONAL_ROLE_COVERAGE_MISSING'],
        nextActions:rolesCount>0?[]:['Assign at least one current operational responsibility for society operations.'],
      },
      {
        id:'activation',title:'4. Resident activation',
        description:'Verify imported owner/current-occupant records can activate through normal mobile OTP/session flows; no shared or default credentials are created.',
        href:'/reports',state:snapshot.eligibleResidents===0||snapshot.activatedResidents===0?'IN_PROGRESS':'READY',
        evidence:snapshot.eligibleResidents===0?'No eligible owner/current-occupant activation cohort is available':`${snapshot.activatedResidents}/${snapshot.eligibleResidents} eligible resident(s) have activated${activationPercent===null?'':` · ${activationPercent}%`}`,
        blockers:snapshot.eligibleResidents===0?['RESIDENT_ACTIVATION_COHORT_MISSING']:snapshot.activatedResidents===0?['RESIDENT_ACTIVATION_NOT_STARTED']:[],
        nextActions:snapshot.eligibleResidents===0
          ?['Complete owner/current-occupant migration or property assignment before resident activation testing.']
          :snapshot.activatedResidents===0
            ?['Run a controlled resident activation using normal OTP and verify the selected property context.']
            :['Use Reports → Resident activation during the first-week pilot; activation evidence is aggregate and does not expose resident activity history.'],
      },
      {
        id:'gate',title:'5. Gate & access readiness',
        description:'Review provider-neutral access-control selection and keep physical-device acceptance outside repository readiness.',
        href:'/integrations',state:snapshot.accessConfigured?'READY':'REVIEW',
        evidence:snapshot.accessConfigured?'Access-control provider selection is enabled; field/device evidence remains external':'No enabled access-control provider selection; manual gate workflows remain authoritative',
        blockers:[],
        nextActions:snapshot.accessConfigured?[]:['Review access-control selection if the society plans device integration. This is not required for manual gate operation.'],
      },
      {
        id:'amenities',title:'6. Amenities',
        description:'Configure amenity inventory only when the AMENITIES entitlement is enabled for this society.',
        href:'/amenities',state:!amenitiesEnabled?'READY':snapshot.activeAmenities>0?'READY':'IN_PROGRESS',
        evidence:!amenitiesEnabled?'Amenities are not enabled; no repository setup is required':snapshot.activeAmenities>0?`${snapshot.activeAmenities} active amenity record(s)`:'Amenities are enabled but no active amenity is configured',
        blockers:amenitiesEnabled&&snapshot.activeAmenities===0?['AMENITY_CONFIGURATION_MISSING']:[],
        nextActions:amenitiesEnabled&&snapshot.activeAmenities===0?['Create at least one active amenity and review its booking policy.']:[],
      },
      {
        id:'billing',title:'7. Billing & finance',
        description:'Use accounting periods as repository finance readiness; payment-provider selection remains a separate integration review.',
        href:'/finance',state:!accountingEnabled?'READY':snapshot.openAccountingPeriods>0?'READY':'IN_PROGRESS',
        evidence:!accountingEnabled?'Society accounting is not enabled; no accounting setup is required':snapshot.openAccountingPeriods>0?`${snapshot.openAccountingPeriods} open accounting period(s)${paymentsEnabled?(snapshot.paymentConfigured?' · payment provider selected':' · payment provider selection needs review'):''}`:'Accounting is enabled but no open accounting period exists',
        blockers:accountingEnabled&&snapshot.openAccountingPeriods===0?['OPEN_ACCOUNTING_PERIOD_MISSING']:[],
        nextActions:[
          ...(accountingEnabled&&snapshot.openAccountingPeriods===0?['Create/review the current accounting period before finance operations.']:[]),
          ...(paymentsEnabled&&!snapshot.paymentConfigured?['Review payment-gateway selection separately; live merchant/provider acceptance remains external.']:[]),
        ],
      },
      {
        id:'policy',title:'8. Governance & society policy',
        description:'Review committee tenure, meeting records, quorum/approval references and society-specific policy in the governance workspace.',
        href:'/governance',state:'REVIEW',
        evidence:`${snapshot.activeCommitteeTenures} active committee tenure(s) · ${snapshot.governanceMeetings} governance meeting record(s)`,
        blockers:[],
        nextActions:snapshot.activeCommitteeTenures>0||snapshot.governanceMeetings>0
          ?['Review society-specific quorum, approval and bye-law references before pilot acceptance.']
          :['Create governance records only where applicable; legal/policy acceptance remains an external human responsibility.'],
      },
    ];

    const blockingSteps=steps.filter(step=>step.blockers.length>0);
    const repositoryReady=blockingSteps.length===0;
    const final:OnboardingStep={
      id:'final',title:'9. Readiness review',
      description:'Review repository evidence before pilot acceptance without treating hosted/provider/device/human acceptance as complete.',
      href:'/onboarding',state:repositoryReady?'REVIEW':'IN_PROGRESS',
      evidence:repositoryReady?'Repository setup has no blocking evidence gaps; external acceptance is still pending':`${blockingSteps.length} repository setup step(s) require action`,
      blockers:blockingSteps.flatMap(step=>step.blockers.map(blocker=>`${step.id}:${blocker}`)),
      nextActions:repositoryReady
        ?['Proceed to explicit pilot/readiness review; keep hosted, provider, device and society-policy acceptance separate.']
        :blockingSteps.map(step=>`Resolve ${step.title.replace(/^\d+\.\s*/,'')}: ${step.nextActions[0]??step.evidence}`),
    };

    const allSteps=[...steps,final];
    return {
      status:repositoryReady?'REPOSITORY_REVIEW_REQUIRED':'ACTION_REQUIRED',
      repositoryReady,
      readySteps:allSteps.filter(step=>step.state==='READY').length,
      totalSteps:allSteps.length,
      blockingStepIds:blockingSteps.map(step=>step.id),
      activation:{eligibleResidents:snapshot.eligibleResidents,activatedResidents:snapshot.activatedResidents,activationPercent},
      steps:allSteps,
      evaluatedAt:snapshot.evaluatedAt,
      productionizationClaim:false,
      boundary:'Repository readiness coordinates existing authoritative modules only. Hosted infrastructure, live provider credentials, physical-device acceptance, real-society migration rehearsal, legal/policy acceptance and production promotion remain external.',
    };
  }
}
