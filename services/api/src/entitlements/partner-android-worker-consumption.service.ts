import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AuthPrincipal } from '../auth/auth.types';
import { LicenseContextInput, PartnerLicenseLifecycleService, canonicalLicenseJson } from './partner-license-lifecycle.service';
import { PartnerAndroidBuildReservationService } from './partner-android-build-reservation.service';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hex=/^[0-9a-f]{64}$/;
const source=/^[0-9a-f]{40}$/;
const worker=/^TEST_WORKER_[A-Z0-9_]{3,48}$/;
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
const digest=(v:unknown)=>sha(canonicalLicenseJson(v));
export type TestWorkerConsumptionInput=LicenseContextInput&{
 allocationId:string;revisionId:string;expectedDigest:string;versionCode:number;
 workerId:string;sourceSha:string;lockDigest:string;nonce:string;
 issuedAt:string;expiresAt:string;signature:string;
};
export type TestWorkerCompletionInput=LicenseContextInput&{
 allocationId:string;revisionId:string;expectedDigest:string;versionCode:number;
 workerId:string;
};
function validateTimes(input:{issuedAt:string;expiresAt:string}){
 const check=(value:string)=>typeof value==='string'&&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) &&
  Number.isFinite(new Date(value).getTime()) &&
  new Date(value).toISOString().slice(0,19)===value.slice(0,19);
 if(!check(input.issuedAt)||!check(input.expiresAt))
  throw new BadRequestException('Invalid TEST worker assertion timestamps');
 const issued=new Date(input.issuedAt),expires=new Date(input.expiresAt),now=Date.now();
 if(issued.getTime()<now-30000||issued.getTime()>now+5000||expires.getTime()<=now||
    expires.getTime()>issued.getTime()+120000)
  throw new ForbiddenException('Expired TEST worker consumption assertion');
 return {issued,expires};
}
/** Internal-only TEST worker consumption barrier. No executable build dispatch
 * or artifact evidence. All worker identities must be authenticated externally. */
@Injectable()
export class PartnerAndroidBuildWorkerConsumptionService {
 constructor(private readonly licenses:PartnerLicenseLifecycleService,
  private readonly reservations:PartnerAndroidBuildReservationService) {}
 async consume(principal:AuthPrincipal,societyId:string,proposalId:string,reservationId:string,
  claimId:string,input:TestWorkerConsumptionInput){
  if(!uuid.test(societyId)||!uuid.test(proposalId)||!uuid.test(reservationId)||
     !uuid.test(claimId)||!uuid.test(input.revisionId)||!hex.test(input.expectedDigest)||
     !source.test(input.sourceSha)||!hex.test(input.lockDigest)||
     !worker.test(input.workerId)||!hex.test(input.nonce)||!hex.test(input.signature)||
     !Number.isSafeInteger(input.versionCode)||input.versionCode<1||input.versionCode>2100000000)
   throw new BadRequestException('Invalid TEST worker consumption');
  const {issued,expires}=validateTimes(input);
  const key=process.env.AARAGATE_TEST_ANDROID_WORKER_HMAC_KEY;
  if(typeof key!=='string'||!hex.test(key))
   throw new ForbiddenException('TEST worker authentication is not configured');
  const message='aaraagate:v5.5.8:test-consume:v1\n'+canonicalLicenseJson({
   societyId,proposalId,reservationId,claimId,actorId:principal.userId,
   grantId:input.grantId,allocationId:input.allocationId,
   expectedGrantVersion:input.expectedGrantVersion,
   expectedOwnershipVersion:input.expectedOwnershipVersion,
   revisionId:input.revisionId,manifestDigest:input.expectedDigest,
   versionCode:input.versionCode,workerId:input.workerId,
   sourceSha:input.sourceSha,lockDigest:input.lockDigest,
   nonce:input.nonce,issuedAt:input.issuedAt,expiresAt:input.expiresAt
  });
  const mac=createHmac('sha256',Buffer.from(key,'hex')).update(message).digest();
  if(!timingSafeEqual(mac,Buffer.from(input.signature,'hex')))
   throw new ForbiddenException('Untrusted TEST worker consumption assertion');
  // Fresh BEFORE_DISPATCH checkpoint; a V5.5.7 claim is NOT sufficient.
  await this.reservations.checkpoint(principal,societyId,proposalId,reservationId,{
   grantId:input.grantId,allocationId:input.allocationId,
   expectedGrantVersion:input.expectedGrantVersion,
   expectedOwnershipVersion:input.expectedOwnershipVersion,
   idempotencyKey:input.idempotencyKey,revisionId:input.revisionId,
   expectedDigest:input.expectedDigest,versionCode:input.versionCode,stage:'BEFORE_DISPATCH'
  });
  try{
   return await this.licenses.withActiveAllocation(principal,societyId,input,async(tx,scope)=>{
    const claim=await tx.partnerAndroidBuildWorkerClaim.findFirst({
     where:{id:claimId,reservationId},
     include:{reservation:{include:{proposal:{include:{approval:{include:{revocation:true}}}},revision:{include:{approval:true}}}}}
    });
    if(!claim||claim.actorId!==principal.userId||claim.workerId!==input.workerId||
       claim.manifestDigest!==input.expectedDigest||claim.versionCode!==input.versionCode||
       claim.expiresAt.getTime()<=Date.now())
     throw new ConflictException('TEST worker claim is foreign, stale or expired');
    const receipt=claim.reservation,proposal=receipt.proposal,revision=receipt.revision;
    if(proposal.id!==proposalId||proposal.allocationId!==scope.allocationId||
       !proposal.approval||proposal.approval.revocation||
       proposal.digest!==digest(proposal.manifest))
     throw new ConflictException('TEST distribution approval changed');
    const latest=await tx.partnerAndroidBuildRevision.findFirst({
     where:{proposalId},orderBy:{version:'desc'},select:{id:true}
    });
    if(!revision.approval||!latest||latest.id!==revision.id||
       revision.id!==input.revisionId||revision.digest!==input.expectedDigest||
       revision.digest!==digest(revision.manifest)||receipt.digest!==revision.digest||
       receipt.versionCode!==input.versionCode)
     throw new ConflictException('TEST reviewed revision or reservation changed');
    const m=revision.manifest as Record<string,unknown>;
    const approved=proposal.manifest as Record<string,unknown>;
    if(m.schemaVersion!==1||m.buildMode!=='TEST'||m.distributionId!==proposalId||
       m.approvalId!==proposal.approval.id||m.societyId!==societyId||
       m.partnerId!==scope.partnerId||m.sourceSha!==input.sourceSha||
       m.lockDigest!==input.lockDigest||
       !['applicationId','namespace','appRole','label','sourceSha','configDigest','apiOrigin','signingProfile']
        .every(k=>m[k]===approved[k])||
       typeof m.signerFingerprint!=='string'||!hex.test(m.signerFingerprint))
     throw new ConflictException('Immutable TEST worker input identity changed');
    const created=await tx.partnerAndroidBuildWorkerConsumption.create({data:{
     claimId,actorId:principal.userId,workerId:input.workerId,
     manifestDigest:revision.digest,nonceDigest:sha(input.nonce),
     sourceSha:input.sourceSha,lockDigest:input.lockDigest,
     versionCode:receipt.versionCode,issuedAt:issued,expiresAt:expires
    },select:{id:true}});
    return {id:created.id,claimId,reservationId,
     status:'CONSUMED_TEST_NO_EXECUTION' as const,
     versionCode:receipt.versionCode,workerId:input.workerId,
     manifestDigest:revision.digest,testOnly:true as const,
     dispatchAllowed:false as const,executionStarted:false as const,
     artifactProduced:false as const,requiresFreshCompletionAuthority:true as const};
   });
  }catch(error){
   if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')
    throw new ConflictException('TEST worker claim already consumed');
   throw error;
  }
 }
 /** Completion is a fresh license checkpoint, NOT acceptance of an archive.
  * Artifact signing, contents and SHA checks remain trusted runner duties. */
 async revalidateCompletion(principal:AuthPrincipal,societyId:string,proposalId:string,
  reservationId:string,consumptionId:string,input:TestWorkerCompletionInput){
  if(!uuid.test(consumptionId)||!uuid.test(reservationId)||!uuid.test(proposalId)||
     !uuid.test(input.revisionId)||!hex.test(input.expectedDigest)||
     !worker.test(input.workerId)||!Number.isSafeInteger(input.versionCode)||
     input.versionCode<1||input.versionCode>2100000000)
   throw new BadRequestException('Invalid TEST completion checkpoint');
  await this.reservations.checkpoint(principal,societyId,proposalId,reservationId,{
   ...input,idempotencyKey:input.idempotencyKey,stage:'BEFORE_COMPLETION'
  });
  return this.licenses.withActiveAllocation(principal,societyId,input,async(tx,scope)=>{
   const used=await tx.partnerAndroidBuildWorkerConsumption.findFirst({
    where:{id:consumptionId,workerId:input.workerId,claim:{reservationId}},
    include:{claim:{include:{reservation:true}}}
   });
   if(!used||used.actorId!==principal.userId||
      used.workerId!==input.workerId||used.claim.workerId!==input.workerId||
      used.claim.actorId!==principal.userId||
      used.claim.reservation.proposalId!==proposalId||
      used.claim.reservation.revisionId!==input.revisionId||
      used.claim.reservation.digest!==input.expectedDigest||
      used.claim.reservation.versionCode!==input.versionCode||
      used.manifestDigest!==input.expectedDigest||
      used.versionCode!==input.versionCode)
    throw new ConflictException('Foreign or changed TEST worker consumption');
   const proposal=await tx.partnerDistributionProposal.findFirst({
    where:{id:proposalId,allocationId:scope.allocationId},select:{id:true}
   });
   if(!proposal)throw new ConflictException('Current TEST allocation unavailable');
   return {status:'CURRENT_TEST_COMPLETION_AUTHORITY_ONLY' as const,
    consumptionId,claimId:used.claimId,reservationId,workerId:input.workerId,
    testOnly:true as const,dispatchAllowed:false as const,
    archiveVerified:false as const,artifactProduced:false as const};
  });
 }
}
