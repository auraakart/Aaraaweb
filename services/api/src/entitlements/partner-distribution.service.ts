import { validAndroidIdentity } from '@aaraagate/config/android-identity';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AuthPrincipal } from '../auth/auth.types';
import { LicenseContextInput, PartnerLicenseLifecycleService, canonicalLicenseJson } from './partner-license-lifecycle.service';
import { SocietyOwnershipTransferService } from './society-ownership-transfer.service';

export type DistributionContext = LicenseContextInput & {allocationId:string};
export type TestDistributionManifest = {
  schemaVersion:1; environment:'TEST'; applicationId:string; namespace:string;
  appRole:'RESIDENT'|'GUARD'; label:string; sourceSha:string; configDigest:string;
  signingProfile:string; apiOrigin:string;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const manifestKeys=['schemaVersion','environment','applicationId','namespace','appRole','label','sourceSha','configDigest','signingProfile','apiOrigin'];

/** Approval is for immutable TEST build inputs only. No shell, signing key,
 * artifact dispatch, production provisioning or session audience activation. */
@Injectable()
export class PartnerDistributionService {
  constructor(private readonly licenses:PartnerLicenseLifecycleService,private readonly ownership:SocietyOwnershipTransferService) {}

  private manifest(value:unknown):TestDistributionManifest {
    if(!value||typeof value!=='object'||Array.isArray(value))throw new BadRequestException('Invalid test distribution manifest');
    const m=value as Record<string,unknown>;
    if(Object.keys(m).length!==manifestKeys.length||Object.keys(m).some(k=>!manifestKeys.includes(k))||
      m.schemaVersion!==1||m.environment!=='TEST'||!['RESIDENT','GUARD'].includes(String(m.appRole))||
      !validAndroidIdentity(m.applicationId)||m.namespace!==m.applicationId||
      typeof m.label!=='string'||m.label.trim()!==m.label||m.label.length<1||m.label.length>60||/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069<>]/.test(m.label)||
      typeof m.sourceSha!=='string'||!/^[0-9a-f]{40}$/.test(m.sourceSha)||
      typeof m.configDigest!=='string'||!/^[0-9a-f]{64}$/.test(m.configDigest)||
      typeof m.signingProfile!=='string'||!/^TEST_[A-Z0-9_]{3,60}$/.test(m.signingProfile)||
      typeof m.apiOrigin!=='string')throw new BadRequestException('Invalid test distribution manifest');
    let origins:unknown;
    try {
      origins=JSON.parse(process.env.AARAGATE_TEST_BUILD_API_ORIGINS??'[]');
      const u=new URL(m.apiOrigin);
      if(!Array.isArray(origins)||origins.length>20||origins.some(o=>typeof o!=='string')||u.protocol!=='https:'||u.origin!==m.apiOrigin||!origins.includes(m.apiOrigin))throw Error();
    }catch{throw new BadRequestException('Test build API origin not allowlisted');}
    return m as TestDistributionManifest;
  }
  private reason(value:string) {
    if(typeof value!=='string'||value.trim().length<3||value.trim().length>500)throw new BadRequestException('Invalid distribution reason');
    return value.trim();
  }
  private reference(value:string) {if(!uuid.test(value))throw new BadRequestException('Invalid distribution reference');}

  async propose(principal:AuthPrincipal,societyId:string,input:DistributionContext & {manifest:unknown}) {
    const manifest=this.manifest(input.manifest);
    const digest=createHash('sha256').update(canonicalLicenseJson(manifest)).digest('hex');
    try {
      return await this.licenses.withActiveAllocation(principal,societyId,input,async(tx,scope)=>{
        const existing=await tx.partnerDistributionProposal.findUnique({where:{allocationId_idempotencyKey:{allocationId:scope.allocationId,idempotencyKey:input.idempotencyKey}}});
        if(existing){
          if(existing.actorId!==principal.userId||existing.digest!==digest||canonicalLicenseJson(existing.manifest)!==canonicalLicenseJson(manifest))throw new ConflictException('Distribution proposal key changed');
          return {id:existing.id,digest,status:'PROPOSED' as const,testOnly:true as const};
        }
        const proposal=await tx.partnerDistributionProposal.create({data:{allocationId:scope.allocationId,actorId:principal.userId,idempotencyKey:input.idempotencyKey,applicationId:manifest.applicationId,manifest:manifest as unknown as Prisma.InputJsonValue,digest},select:{id:true}});
        return {...proposal,digest,status:'PROPOSED' as const,testOnly:true as const};
      });
    }catch(error){
      if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')throw new ConflictException('Distribution identity or request key already registered');
      throw error;
    }
  }
  async approve(principal:AuthPrincipal,societyId:string,proposalId:string,input:DistributionContext & {expectedDigest:string;reason:string}) {
    this.reference(proposalId);const reason=this.reason(input.reason);
    return this.licenses.withActiveAllocation(principal,societyId,input,async(tx,scope)=>{
      const p=await tx.partnerDistributionProposal.findFirst({where:{id:proposalId,allocationId:scope.allocationId},include:{approval:{include:{revocation:true}}}});
      if(!p)throw new NotFoundException('Distribution proposal unavailable');
      const manifest=this.manifest(p.manifest);
      if(p.digest!==input.expectedDigest||p.digest!==createHash('sha256').update(canonicalLicenseJson(manifest)).digest('hex'))throw new ConflictException('Distribution digest changed');
      if(p.actorId===principal.userId)throw new ForbiddenException('Independent distribution approval required');
      const makers=await tx.$queryRaw<{id:string}[]>`SELECT u."id" FROM "User" u JOIN "SocietyMembership" m ON m."userId"=u."id"
        WHERE u."id"=${p.actorId}::uuid AND u."status"='ACTIVE' AND m."societyId"=${societyId}::uuid AND m."active"=true AND m."role"='SUPER_ADMIN' FOR SHARE OF u,m`;
      if(!makers.length)throw new ForbiddenException('Distribution proposer authority unavailable');
      if(p.approval){
        const a=p.approval;
        if(a.revocation||a.actorId!==principal.userId||a.idempotencyKey!==input.idempotencyKey||a.reason!==reason)throw new ConflictException('Distribution approval changed or revoked');
        return {id:a.id,proposalId,digest:p.digest,status:'APPROVED_TEST_INPUT' as const,testOnly:true as const};
      }
      const used=await tx.partnerDistributionApproval.count({where:{revocation:null,proposal:{allocation:{approvalId:scope.approvalId}}}});
      if(used>=scope.maximumDistributions)throw new ConflictException('Distribution capacity exhausted');
      const a=await tx.partnerDistributionApproval.create({data:{proposalId,actorId:principal.userId,idempotencyKey:input.idempotencyKey,reason},select:{id:true}});
      return {...a,proposalId,digest:p.digest,status:'APPROVED_TEST_INPUT' as const,testOnly:true as const};
    });
  }
  async approved(principal:AuthPrincipal,societyId:string,proposalId:string,input:DistributionContext) {
    this.reference(proposalId);
    return this.licenses.withActiveAllocation(principal,societyId,input,async(tx,scope)=>{
      const p=await tx.partnerDistributionProposal.findFirst({where:{id:proposalId,allocationId:scope.allocationId,approval:{is:{revocation:null}}},include:{approval:true}});
      if(!p)throw new NotFoundException('Approved distribution unavailable');
      const manifest=this.manifest(p.manifest);
      if(p.digest!==createHash('sha256').update(canonicalLicenseJson(manifest)).digest('hex'))throw new ConflictException('Distribution digest changed');
      return {proposalId,approvalId:p.approval!.id,partnerId:scope.partnerId,manifest,digest:p.digest,testOnly:true as const,buildDispatched:false as const};
    });
  }
  // Revocation remains available after commercial expiry/withdrawal/transfer.
  async revoke(principal:AuthPrincipal,societyId:string,proposalId:string,input:{idempotencyKey:string;reason:string}) {
    this.reference(proposalId);this.reference(input.idempotencyKey);const reason=this.reason(input.reason);
    return this.ownership.withAuthorizedSociety(principal,societyId,async(tx)=>{
      const p=await tx.partnerDistributionProposal.findFirst({where:{id:proposalId,allocation:{societyId}},include:{approval:{include:{revocation:true}}}});
      if(!p?.approval)throw new NotFoundException('Approved distribution unavailable');
      // Same grant-row serialization as approval. Lock order: society then grant.
      const a=await tx.societyLicenseAllocation.findUniqueOrThrow({where:{id:p.allocationId},include:{approval:{select:{grantId:true}}}});
      await tx.$queryRaw`SELECT "id" FROM "PartnerLicenseGrant" WHERE "id"=${a.approval.grantId}::uuid FOR UPDATE`;
      // Reread under lock so concurrent same-key revocations replay safely.
      const previous=await tx.partnerDistributionRevocation.findUnique({where:{approvalId:p.approval.id}});
      if(previous){
        if(previous.actorId!==principal.userId||previous.idempotencyKey!==input.idempotencyKey||previous.reason!==reason)throw new ConflictException('Distribution revocation key changed');
        return {id:previous.id,status:'REVOKED' as const};
      }
      const r=await tx.partnerDistributionRevocation.create({data:{approvalId:p.approval.id,actorId:principal.userId,idempotencyKey:input.idempotencyKey,reason},select:{id:true}});
      return {...r,status:'REVOKED' as const};
    });
  }
}
