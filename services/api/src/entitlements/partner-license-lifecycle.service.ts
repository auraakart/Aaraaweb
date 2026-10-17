import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthPrincipal } from '../auth/auth.types';
import { EntitlementService } from './entitlement.service';
import { ProductFeature } from './entitlement.types';
import { licensePhaseAt } from './partner-license-contract';
import { SocietyOwnershipTransferService } from './society-ownership-transfer.service';

export type LicenseContextInput = { grantId: string; expectedGrantVersion: number; expectedOwnershipVersion: number; idempotencyKey: string };
export type LicenseApprovalInput = LicenseContextInput & { reason: string; essentialPolicy: 'PRESERVE_LEGACY' };
export type LicenseConsentInput = LicenseContextInput & { decision: 'OPT_IN' | 'WITHDRAW'; expectedFeatures: ProductFeature[] };
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const features=new Set<string>(Object.values(ProductFeature));
export const sameLicenseFeatures=(a:unknown,b:ProductFeature[])=>Array.isArray(a)&&a.length===b.length&&new Set(a).size===a.length&&a.every(f=>b.includes(f));
export const canonicalLicenseJson=(v:unknown):string=>JSON.stringify(v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(x=>JSON.parse(canonicalLicenseJson(x))):Object.fromEntries(Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,JSON.parse(canonicalLicenseJson(x))])));

/** Immutable commercial approval + explicit society consent; operational
 * entitlement resolution remains exactly the legacy tier/override resolver. */
@Injectable()
export class PartnerLicenseLifecycleService {
  constructor(private readonly ownership:SocietyOwnershipTransferService,private readonly entitlements:EntitlementService) {}
  private validate(input:LicenseContextInput) {
    if(!uuid.test(input.grantId)||!uuid.test(input.idempotencyKey)||!Number.isSafeInteger(input.expectedGrantVersion)||input.expectedGrantVersion<1||
      !Number.isSafeInteger(input.expectedOwnershipVersion)||input.expectedOwnershipVersion<1) throw new BadRequestException('Invalid license context');
  }
  private reason(input:{reason:string}) {
    if(typeof input.reason!=='string'||input.reason.trim().length<3||input.reason.trim().length>500)throw new BadRequestException('Invalid license reason');
    return input.reason.trim();
  }
  private async grant(tx:Prisma.TransactionClient,societyId:string,owner:{partnerId:string;ownershipVersion:number},input:LicenseContextInput,active=true) {
    if(owner.ownershipVersion!==input.expectedOwnershipVersion)throw new ConflictException('Ownership version changed');
    await tx.$queryRaw`SELECT "id" FROM "PartnerLicenseGrant" WHERE "id"=${input.grantId}::uuid FOR UPDATE`;
    const g=await tx.partnerLicenseGrant.findFirst({where:{id:input.grantId,partnerId:owner.partnerId},include:{planRevision:true,approval:{include:{revocation:true}}}});
    if(!g)throw new NotFoundException('License unavailable');
    const partners=await tx.$queryRaw<{status:string}[]>`SELECT "status" FROM "Partner" WHERE "id"=${owner.partnerId}::uuid FOR UPDATE`;
    if(g.version!==input.expectedGrantVersion||g.status!=='DRAFT'||!partners.length||(active&&partners[0].status!=='ACTIVE'))throw new ConflictException('License context changed');
    if(owner.ownershipVersion>1){
      const history=await tx.societyOwnershipTransfer.findUnique({where:{societyId_ownershipVersion:{societyId,ownershipVersion:owner.ownershipVersion}},include:{request:{select:{toPartnerId:true}}}});
      if(!history||history.request.toPartnerId!==owner.partnerId)throw new ConflictException('Ownership history unavailable');
    }
    return g;
  }
  private phase(g:{startsAt:Date;endsAt:Date;graceUntil:Date|null}) {
    return licensePhaseAt({startsAt:g.startsAt.toISOString(),endsAt:g.endsAt.toISOString(),graceUntil:g.graceUntil?.toISOString()},new Date().toISOString());
  }
  private async legacy(tx:Prisma.TransactionClient,societyId:string) {
    const [s,current]=await Promise.all([tx.society.findUniqueOrThrow({where:{id:societyId},select:{productTier:true,featureOverrides:true}}),this.entitlements.current(societyId,tx)]);
    if(!current)throw new ConflictException('Legacy entitlements unavailable');
    return {...s,enabledFeatures:current.enabledFeatures};
  }
  private compatible(planFeatures:unknown,current:ProductFeature[]) {
    if(!Array.isArray(planFeatures)||new Set(planFeatures).size!==planFeatures.length||planFeatures.some(f=>typeof f!=='string'||!features.has(f))||current.some(f=>!planFeatures.includes(f)))throw new ConflictException('License plan would remove enabled legacy features');
  }

  async approve(principal:AuthPrincipal,societyId:string,input:LicenseApprovalInput) {
    this.validate(input);const reason=this.reason(input);
    if(input.essentialPolicy!=='PRESERVE_LEGACY')throw new BadRequestException('Explicit legacy continuity policy required');
    return this.ownership.withAuthorizedSociety(principal,societyId,async(tx,owner)=>{
      const g=await this.grant(tx,societyId,owner,input);
      if(g.createdById===principal.userId)throw new ForbiddenException('Independent commercial approval required');
      const makers=await tx.$queryRaw<{id:string}[]>`SELECT u."id" FROM "User" u JOIN "SocietyMembership" m ON m."userId"=u."id"
        WHERE u."id"=${g.createdById}::uuid AND u."status"='ACTIVE' AND m."societyId"=${societyId}::uuid AND m."active"=true AND m."role"='SUPER_ADMIN' FOR SHARE OF u,m`;
      if(!makers.length)throw new ForbiddenException('Commercial maker authority unavailable');
      if(!['ACTIVE','NOT_STARTED'].includes(this.phase(g)))throw new ConflictException('License approval period ended');
      const legacy=await this.legacy(tx,societyId);this.compatible(g.planRevision.featureAllowlist,legacy.enabledFeatures);
      if(g.approval){
        const a=g.approval;
        if(a.revocation||a.approvedById!==principal.userId||a.idempotencyKey!==input.idempotencyKey||a.reason!==reason||a.societyId!==societyId||a.ownershipVersion!==owner.ownershipVersion||a.grantVersion!==g.version)throw new ConflictException('License approval already recorded or revoked');
        return {id:a.id,status:'APPROVED' as const,grantVersion:g.version};
      }
      const overlap=await tx.partnerLicenseApproval.findFirst({where:{revocation:null,grant:{partnerId:owner.partnerId,startsAt:{lt:g.endsAt},endsAt:{gt:g.startsAt}}},select:{id:true}});
      if(overlap)throw new ConflictException('Approved partner license periods overlap');
      const a=await tx.partnerLicenseApproval.create({data:{grantId:g.id,grantVersion:g.version,societyId,ownershipVersion:owner.ownershipVersion,approvedById:principal.userId,idempotencyKey:input.idempotencyKey,reason,essentialPolicy:input.essentialPolicy},select:{id:true}});
      return {id:a.id,status:'APPROVED' as const,grantVersion:g.version};
    });
  }

  async revoke(principal:AuthPrincipal,societyId:string,input:LicenseContextInput & {reason:string}) {
    this.validate(input);const reason=this.reason(input);
    return this.ownership.withAuthorizedSociety(principal,societyId,async(tx,owner)=>{
      const g=await this.grant(tx,societyId,owner,input,false);
      if(!g.approval)throw new NotFoundException('Approved license unavailable');
      const previous=g.approval.revocation;
      if(previous){
        if(previous.actorId!==principal.userId||previous.societyId!==societyId||previous.ownershipVersion!==owner.ownershipVersion||previous.idempotencyKey!==input.idempotencyKey||previous.reason!==reason)throw new ConflictException('License revocation key changed');
        return {id:previous.id,status:'REVOKED' as const};
      }
      const r=await tx.partnerLicenseRevocation.create({data:{approvalId:g.approval.id,societyId,ownershipVersion:owner.ownershipVersion,actorId:principal.userId,idempotencyKey:input.idempotencyKey,reason},select:{id:true}});
      return {id:r.id,status:'REVOKED' as const};
    });
  }

  async consent(principal:AuthPrincipal,societyId:string,input:LicenseConsentInput) {
    this.validate(input);
    if(!['OPT_IN','WITHDRAW'].includes(input.decision)||!Array.isArray(input.expectedFeatures)||new Set(input.expectedFeatures).size!==input.expectedFeatures.length||input.expectedFeatures.some(f=>!features.has(f)))throw new BadRequestException('Invalid society consent');
    return this.ownership.withConsentAuthority(principal,societyId,async(tx,owner)=>{
      const g=await this.grant(tx,societyId,owner,input,input.decision==='OPT_IN');
      const legacy=await this.legacy(tx,societyId);
      if(input.decision==='OPT_IN'){
        if(!['ACTIVE','NOT_STARTED'].includes(this.phase(g))||g.approval?.revocation)throw new ConflictException('License opt-in unavailable');
        if(!sameLicenseFeatures(input.expectedFeatures,legacy.enabledFeatures))throw new ConflictException('Legacy feature expectation changed');
        this.compatible(g.planRevision.featureAllowlist,legacy.enabledFeatures);
      }
      const latest=await tx.societyLicenseConsent.findFirst({where:{societyId,grantId:g.id,ownershipVersion:owner.ownershipVersion},orderBy:{sequence:'desc'}});
      const previous=await tx.societyLicenseConsent.findUnique({where:{societyId_idempotencyKey:{societyId,idempotencyKey:input.idempotencyKey}}});
      if(previous){
        if(previous.id!==latest?.id||previous.actorId!==principal.userId||previous.grantId!==g.id||previous.grantVersion!==g.version||previous.ownershipVersion!==owner.ownershipVersion||previous.decision!==input.decision||
          (input.decision==='OPT_IN'&&(previous.productTier!==legacy.productTier||canonicalLicenseJson(previous.featureOverrides)!==canonicalLicenseJson(legacy.featureOverrides)||!sameLicenseFeatures(previous.enabledFeatures,legacy.enabledFeatures))))throw new ConflictException('Consent request key changed or superseded');
        return {id:previous.id,decision:previous.decision,sequence:previous.sequence};
      }
      if(latest?.decision===input.decision)throw new ConflictException('Consent decision already current; replay the original request');
      const baseline=await tx.societyEntitlementCompatibility.findUnique({where:{societyId},select:{sourceMigration:true}});
      const c=await tx.societyLicenseConsent.create({data:{societyId,ownershipVersion:owner.ownershipVersion,grantId:g.id,grantVersion:g.version,actorId:principal.userId,decision:input.decision,idempotencyKey:input.idempotencyKey,
        productTier:legacy.productTier,featureOverrides:legacy.featureOverrides===null?Prisma.JsonNull:legacy.featureOverrides,enabledFeatures:legacy.enabledFeatures,compatibilityMigration:baseline?.sourceMigration??null},select:{id:true,decision:true,sequence:true}});
      return c;
    });
  }

  async activate(principal:AuthPrincipal,societyId:string,input:LicenseContextInput & {consentId:string}) {
    this.validate(input);if(!uuid.test(input.consentId))throw new BadRequestException('Invalid society consent reference');
    return this.ownership.withAuthorizedSociety(principal,societyId,async(tx,owner)=>{
      const g=await this.grant(tx,societyId,owner,input);
      if(!g.approval||g.approval.revocation||g.approval.grantVersion!==g.version||this.phase(g)!=='ACTIVE')throw new ConflictException('Approved active license unavailable');
      const c=await tx.societyLicenseConsent.findFirst({where:{societyId,grantId:g.id,ownershipVersion:owner.ownershipVersion},orderBy:{sequence:'desc'}});
      const legacy=await this.legacy(tx,societyId);
      if(!c||c.id!==input.consentId||c.decision!=='OPT_IN'||c.grantVersion!==g.version||c.productTier!==legacy.productTier||canonicalLicenseJson(c.featureOverrides)!==canonicalLicenseJson(legacy.featureOverrides)||!sameLicenseFeatures(c.enabledFeatures,legacy.enabledFeatures))throw new ConflictException('Current compatible society opt-in required');
      this.compatible(g.planRevision.featureAllowlist,legacy.enabledFeatures);
      const replay=await tx.societyLicenseAllocation.findUnique({where:{approvalId_idempotencyKey:{approvalId:g.approval.id,idempotencyKey:input.idempotencyKey}}});
      if(replay){
        if(replay.actorId!==principal.userId||replay.societyId!==societyId||replay.ownershipVersion!==owner.ownershipVersion||replay.consentId!==c.id)throw new ConflictException('Allocation request key changed');
        return {id:replay.id,status:'ACTIVE_ALLOCATION' as const,consentId:c.id};
      }
      if(await tx.societyLicenseAllocation.findUnique({where:{consentId:c.id},select:{id:true}}))throw new ConflictException('Consent already allocated; replay the original request');
      const [capacity]=await tx.$queryRaw<{used:number}[]>`SELECT aaraagate_v5454_used(${g.approval.id}::uuid)::integer AS "used"`;
      if(!capacity||capacity.used>=g.planRevision.maximumSocieties)throw new ConflictException('Approved license capacity exhausted');
      const a=await tx.societyLicenseAllocation.create({data:{approvalId:g.approval.id,societyId,ownershipVersion:owner.ownershipVersion,consentId:c.id,actorId:principal.userId,idempotencyKey:input.idempotencyKey},select:{id:true}});
      return {id:a.id,status:'ACTIVE_ALLOCATION' as const,consentId:c.id};
    });
  }
  /** Current, locked allocation authority reused by distribution and conversion.
   * A persisted receipt alone is never current commercial authorization. */
  async withActiveAllocation<T>(principal:AuthPrincipal,societyId:string,
    input:LicenseContextInput & {allocationId:string},
    operation:(tx:Prisma.TransactionClient, context:{allocationId:string;approvalId:string;partnerId:string;maximumDistributions:number;legacy:{productTier:import('@prisma/client').ProductTier;featureOverrides:Prisma.JsonValue;enabledFeatures:ProductFeature[]}})=>Promise<T>):Promise<T> {
    this.validate(input);
    if(!uuid.test(input.allocationId))throw new BadRequestException('Invalid allocation reference');
    return this.ownership.withAuthorizedSociety(principal,societyId,async(tx,owner)=>{
      const g=await this.grant(tx,societyId,owner,input);
      if(!g.approval||g.approval.revocation||g.approval.grantVersion!==g.version||this.phase(g)!=='ACTIVE')throw new ConflictException('Approved active license unavailable');
      const c=await tx.societyLicenseConsent.findFirst({where:{societyId,grantId:g.id,ownershipVersion:owner.ownershipVersion},orderBy:{sequence:'desc'}});
      const legacy=await this.legacy(tx,societyId);
      if(!c||c.decision!=='OPT_IN'||c.grantVersion!==g.version||c.productTier!==legacy.productTier||canonicalLicenseJson(c.featureOverrides)!==canonicalLicenseJson(legacy.featureOverrides)||!sameLicenseFeatures(c.enabledFeatures,legacy.enabledFeatures))throw new ConflictException('Current compatible society opt-in required');
      this.compatible(g.planRevision.featureAllowlist,legacy.enabledFeatures);
      const allocation=await tx.societyLicenseAllocation.findFirst({where:{id:input.allocationId,societyId,ownershipVersion:owner.ownershipVersion,approvalId:g.approval.id,consentId:c.id},select:{id:true}});
      if(!allocation)throw new NotFoundException('Current allocation unavailable');
      return operation(tx,{allocationId:allocation.id,approvalId:g.approval.id,partnerId:owner.partnerId,maximumDistributions:g.planRevision.maximumDistributions,legacy});
    });
  }

}
