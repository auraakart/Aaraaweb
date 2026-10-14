import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AuthPrincipal } from '../auth/auth.types';
import { LicenseContextInput, PartnerLicenseLifecycleService, canonicalLicenseJson } from './partner-license-lifecycle.service';
import { PartnerAndroidBuildReservationService } from './partner-android-build-reservation.service';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hex=/^[0-9a-f]{64}$/;
const worker=/^TEST_WORKER_[A-Z0-9_]{3,48}$/;
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const digest=(v:unknown)=>sha(canonicalLicenseJson(v));
export type TestWorkerClaimInput=LicenseContextInput&{
 allocationId:string;revisionId:string;expectedDigest:string;
 versionCode:number;workerId:string;nonce:string;
 issuedAt:string;expiresAt:string;signature:string
};
/** Private TEST-only claim receipt. No route, worker queue, native invocation,
 * secret storage, built archive or dispatch permission. */
@Injectable()
export class PartnerAndroidBuildWorkerClaimService {
 constructor(
  private readonly licenses:PartnerLicenseLifecycleService,
  private readonly reservations:PartnerAndroidBuildReservationService
 ) {}
 async claim(principal:AuthPrincipal,societyId:string,proposalId:string,reservationId:string,input:TestWorkerClaimInput) {
  if(!uuid.test(societyId)||!uuid.test(proposalId)||!uuid.test(reservationId)||
     !uuid.test(input.revisionId)||!hex.test(input.expectedDigest)||
     !Number.isSafeInteger(input.versionCode)||input.versionCode<1||input.versionCode>2100000000||
     !worker.test(input.workerId)||!hex.test(input.nonce)||!hex.test(input.signature))
   throw new BadRequestException('Invalid TEST worker claim reference');
  const issued=new Date(input.issuedAt),expiry=new Date(input.expiresAt),now=Date.now();
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(input.issuedAt)||
     !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(input.expiresAt)||
     !Number.isFinite(issued.getTime())||!Number.isFinite(expiry.getTime())||
     issued.toISOString().slice(0,19)!==input.issuedAt.slice(0,19)||
     expiry.toISOString().slice(0,19)!==input.expiresAt.slice(0,19)||
     issued.getTime()<now-30000||issued.getTime()>now+5000||
     expiry.getTime()<=now||expiry.getTime()>issued.getTime()+120000)
   throw new ForbiddenException('Expired TEST worker assertion');
  // Fail closed until an isolated TEST worker key is provisioned out of band.
  const key=process.env.AARAGATE_TEST_ANDROID_WORKER_HMAC_KEY;
  if(typeof key!=='string'||!hex.test(key))
   throw new ForbiddenException('TEST Android worker is not configured');
  const message='aaraagate:v5.5.7:test-claim:v1\n'+canonicalLicenseJson({
   societyId,proposalId,reservationId,actorId:principal.userId,
   grantId:input.grantId,allocationId:input.allocationId,
   expectedGrantVersion:input.expectedGrantVersion,
   expectedOwnershipVersion:input.expectedOwnershipVersion,
   revisionId:input.revisionId,manifestDigest:input.expectedDigest,
   versionCode:input.versionCode,workerId:input.workerId,
   nonce:input.nonce,issuedAt:input.issuedAt,expiresAt:input.expiresAt
  });
  const mac=createHmac('sha256',Buffer.from(key,'hex')).update(message).digest();
  if(!timingSafeEqual(mac,Buffer.from(input.signature,'hex')))
   throw new ForbiddenException('Untrusted TEST Android worker');
  await this.reservations.checkpoint(principal,societyId,proposalId,reservationId,{
   grantId:input.grantId,allocationId:input.allocationId,
   expectedGrantVersion:input.expectedGrantVersion,
   expectedOwnershipVersion:input.expectedOwnershipVersion,
   idempotencyKey:input.idempotencyKey,revisionId:input.revisionId,
   expectedDigest:input.expectedDigest,versionCode:input.versionCode,stage:'BEFORE_DISPATCH'
  });
  // Second live authorization under lock; DB trigger rechecks at insertion.
  try {
   return await this.licenses.withActiveAllocation(principal,societyId,input,async(tx,scope)=>{
    const proposal=await tx.partnerDistributionProposal.findFirst({
     where:{id:proposalId,allocationId:scope.allocationId},
     include:{approval:{include:{revocation:true}}}
    });
    if(!proposal?.approval||proposal.approval.revocation||proposal.digest!==digest(proposal.manifest))
     throw new ConflictException('Current TEST distribution approval changed');
    const revision=await tx.partnerAndroidBuildRevision.findFirst({
     where:{proposalId},orderBy:{version:'desc'},include:{approval:true}
    });
    if(!revision?.approval||revision.id!==input.revisionId||
       revision.digest!==input.expectedDigest||revision.digest!==digest(revision.manifest))
     throw new ConflictException('Reviewed TEST Android revision changed');
    const receipt=await tx.partnerAndroidBuildReservation.findFirst({
     where:{id:reservationId,proposalId},
     select:{id:true,revisionId:true,digest:true,versionCode:true}
    });
    if(!receipt||receipt.revisionId!==revision.id||receipt.digest!==revision.digest||
       receipt.versionCode!==input.versionCode)
     throw new ConflictException('Reserved TEST Android version changed');
    const m=revision.manifest as Record<string,unknown>,a=proposal.manifest as Record<string,unknown>;
    if(m.buildMode!=='TEST'||m.distributionId!==proposalId||m.societyId!==societyId||
       m.partnerId!==scope.partnerId||m.approvalId!==proposal.approval.id||
       !['applicationId','namespace','appRole','label','sourceSha','configDigest','apiOrigin','signingProfile']
       .every(k=>m[k]===a[k])||
       typeof m.signerFingerprint!=='string'||!hex.test(m.signerFingerprint))
     throw new ConflictException('Immutable TEST Android identity changed');
    const created=await tx.partnerAndroidBuildWorkerClaim.create({data:{
     reservationId,actorId:principal.userId,workerId:input.workerId,
     assertionDigest:sha(input.signature),nonceDigest:sha(input.nonce),
     manifestDigest:revision.digest,versionCode:receipt.versionCode,
     issuedAt:issued,expiresAt:expiry
    },select:{id:true}});
    return {id:created.id,reservationId,revisionId:revision.id,
     status:'CLAIMED_TEST_NO_EXECUTION' as const,versionCode:receipt.versionCode,
     manifestDigest:revision.digest,workerId:input.workerId,
     expiresAt:expiry.toISOString(),testOnly:true as const,
     dispatchAllowed:false as const,executionStarted:false as const,
     artifactProduced:false as const};
   });
  }catch(error){
   if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')
    throw new ConflictException('Android reservation already has a worker claim');
   throw error;
  }
 }
}
