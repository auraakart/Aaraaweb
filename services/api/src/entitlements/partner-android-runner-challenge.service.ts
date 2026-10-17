import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AuthPrincipal } from '../auth/auth.types';
import { LicenseContextInput, PartnerLicenseLifecycleService, canonicalLicenseJson } from './partner-license-lifecycle.service';
import { PartnerAndroidBuildReservationService } from './partner-android-build-reservation.service';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hex=/^[0-9a-f]{64}$/;
const worker=/^TEST_WORKER_[A-Z0-9_]{3,48}$/;
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const digest=(value:unknown)=>sha(canonicalLicenseJson(value));

export type TestAndroidRunnerChallengeInput=LicenseContextInput&{
 allocationId:string;revisionId:string;expectedDigest:string;
 versionCode:number;workerId:string
};
/**
 * Internal-only, non-dispatchable, durable one-time TEST runner challenge.
 * Caller is an authorized server process, never a direct client/partner route.
 * A challenge is not a worker session or APK build permit.
 */
@Injectable()
export class PartnerAndroidRunnerChallengeService {
 constructor(
  private readonly licenses:PartnerLicenseLifecycleService,
  private readonly reservations:PartnerAndroidBuildReservationService
 ) {}
 async issue(principal:AuthPrincipal,societyId:string,proposalId:string,
  reservationId:string,consumptionId:string,input:TestAndroidRunnerChallengeInput){
  if(!uuid.test(societyId)||!uuid.test(proposalId)||!uuid.test(reservationId)||
     !uuid.test(consumptionId)||!uuid.test(input.revisionId)||
     !hex.test(input.expectedDigest)||!worker.test(input.workerId)||
     !Number.isSafeInteger(input.versionCode)||input.versionCode<1||
     input.versionCode>2100000000)
   throw new BadRequestException('Invalid TEST runner challenge reference');
  const workerId=process.env.AARAGATE_TEST_ANDROID_WORKER_ID;
  const imageDigest=process.env.AARAGATE_TEST_ANDROID_RUNNER_IMAGE_SHA256;
  if(workerId!==input.workerId||typeof imageDigest!=='string'||
     !/^sha256:[0-9a-f]{64}$/.test(imageDigest))
   throw new ForbiddenException('Independent TEST runner image/identity not configured');
  // Current commercial and distribution authority is a prerequisite, never a
  // substitute for the worker cryptographic proof or authenticated transport.
  await this.reservations.checkpoint(principal,societyId,proposalId,reservationId,{
   grantId:input.grantId,allocationId:input.allocationId,
   expectedGrantVersion:input.expectedGrantVersion,
   expectedOwnershipVersion:input.expectedOwnershipVersion,
   idempotencyKey:input.idempotencyKey,revisionId:input.revisionId,
   expectedDigest:input.expectedDigest,versionCode:input.versionCode,stage:'BEFORE_DISPATCH'
  });
  const issuedAt=new Date(),expiresAt=new Date(issuedAt.getTime()+60000);
  const nonce=randomBytes(32).toString('hex');
  const runId='TEST_RUN_'+randomBytes(16).toString('hex').toUpperCase();
  try{
   return await this.licenses.withActiveAllocation(principal,societyId,input,async(tx,scope)=>{
    const used=await tx.partnerAndroidBuildWorkerConsumption.findFirst({
     where:{id:consumptionId,workerId:input.workerId,claim:{reservationId}},
     include:{claim:{include:{reservation:{include:{
      proposal:{include:{approval:{include:{revocation:true}}}},
      revision:{include:{approval:true}}
     }}}}}
    });
    if(!used||used.actorId!==principal.userId||used.workerId!==input.workerId||
       used.manifestDigest!==input.expectedDigest||
       used.versionCode!==input.versionCode||
       used.sourceSha!==undefined && used.sourceSha.length!==40)
     throw new ConflictException('No matching consumed TEST runner authority');
    const claim=used.claim,receipt=claim.reservation,proposal=receipt.proposal,
      revision=receipt.revision;
    if(claim.actorId!==principal.userId||claim.workerId!==input.workerId||
       claim.expiresAt.getTime()<=Date.now()||
       receipt.proposalId!==proposalId||proposal.allocationId!==scope.allocationId||
       !proposal.approval||proposal.approval.revocation||
       proposal.digest!==digest(proposal.manifest))
     throw new ConflictException('Current TEST worker claim or distribution changed');
    const latest=await tx.partnerAndroidBuildRevision.findFirst({
     where:{proposalId},orderBy:{version:'desc'},select:{id:true}
    });
    if(!latest||latest.id!==revision.id||!revision.approval||
       revision.id!==input.revisionId||
       revision.digest!==input.expectedDigest||
       receipt.digest!==input.expectedDigest||
       receipt.versionCode!==input.versionCode||
       revision.digest!==digest(revision.manifest))
     throw new ConflictException('TEST build revision or version reservation changed');
    const m=revision.manifest as Record<string,unknown>;
    if(m.buildMode!=='TEST'||m.distributionId!==proposalId||
       m.societyId!==societyId||m.partnerId!==scope.partnerId||
       m.sourceSha!==used.sourceSha||m.lockDigest!==used.lockDigest)
     throw new ConflictException('TEST source identity no longer authorized');
    const created=await tx.partnerAndroidRunnerChallenge.create({data:{
     consumptionId,actorId:principal.userId,workerId:input.workerId,
     runId,nonceDigest:sha(nonce),imageDigest,
     manifestDigest:input.expectedDigest,versionCode:input.versionCode,
     issuedAt,expiresAt
    },select:{id:true,runId:true}});
    // Only the internal trusted worker channel should receive raw nonce.
    // Database stores a SHA-256 digest, not the nonce or signing secret.
    return {id:created.id,consumptionId,runId:created.runId,
     workerId:input.workerId,imageDigest,nonce,
     issuedAt:issuedAt.toISOString(),expiresAt:expiresAt.toISOString(),
     status:'ISSUED_TEST_NO_EXECUTION' as const,testOnly:true as const,
     dispatchAllowed:false as const,runnerAuthenticated:false as const,
     artifactProduced:false as const,requiresSignedWorkerEvidence:true as const};
   });
  }catch(error){
   if(error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2002')
    throw new ConflictException('TEST runner challenge already issued or replayed');
   throw error;
  }
 }
}
