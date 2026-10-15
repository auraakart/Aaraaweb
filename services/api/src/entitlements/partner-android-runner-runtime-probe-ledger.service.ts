import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthPrincipal } from '../auth/auth.types';
import { LicenseContextInput, PartnerLicenseLifecycleService, canonicalLicenseJson } from './partner-license-lifecycle.service';
import { PartnerAndroidBuildReservationService } from './partner-android-build-reservation.service';
import { createHash } from 'node:crypto';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hex=/^[0-9a-f]{64}$/;
const git=/^[0-9a-f]{40}$/;
const image=/^sha256:[0-9a-f]{64}$/;
const worker=/^TEST_WORKER_[A-Z0-9_]{3,48}$/;
const run=/^TEST_RUN_[A-Z0-9_]{3,48}$/;
const keys=['schemaVersion','environment','testOnly','imageDigest','sourceSha','workerId',
 'runId','challengeId','acceptanceId','tls13PinnedPeerVerified',
 'clientTlsCertificateConfigured','freshTransportNonceSignatureVerified',
 'independentRuntimeClaimSignaturesVerified','transportNonceDigest',
 'runtimeEnvelopeDigest','transportSignatureDigest','serverSpkiSha256','verifiedAt',
 'independentlyProvisionedWorkerVerified','remoteProcessMeasured','runtimeImageAttested',
 'immutableMountVerified','singleUseChallengeConsumed','buildExecutionAuthorized',
 'artifactProduced','dispatchAllowed'];
const digest=(v:unknown)=>createHash('sha256').update(canonicalLicenseJson(v)).digest('hex');
export type TestRuntimeProbeLedgerInput=LicenseContextInput&{
 allocationId:string;revisionId:string;expectedDigest:string;
 versionCode:number;workerId:string
};
export type NonDispatchableRuntimeProbeReceipt=Readonly<{
 schemaVersion:1;environment:'TEST';testOnly:true;
 imageDigest:string;sourceSha:string;workerId:string;runId:string;
 challengeId:string;acceptanceId:string;
 tls13PinnedPeerVerified:true;clientTlsCertificateConfigured:true;
 freshTransportNonceSignatureVerified:true;independentRuntimeClaimSignaturesVerified:true;
 transportNonceDigest:string;runtimeEnvelopeDigest:string;
 transportSignatureDigest:string;serverSpkiSha256:string;verifiedAt:string;
 independentlyProvisionedWorkerVerified:false;remoteProcessMeasured:false;
 runtimeImageAttested:false;immutableMountVerified:false;
 singleUseChallengeConsumed:false;buildExecutionAuthorized:false;
 artifactProduced:false;dispatchAllowed:false
}>;
const exact=(v:unknown,fields:string[]):v is Record<string,unknown>=>v!==null&&
 typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&
 Object.keys(v).sort().join(',')===fields.slice().sort().join(',');
const acceptedReceipt=(v:unknown):v is NonDispatchableRuntimeProbeReceipt=>{
 if(!exact(v,keys))return false;
 const s=v.verifiedAt;
 return v.schemaVersion===1&&v.environment==='TEST'&&v.testOnly===true&&
  v.tls13PinnedPeerVerified===true&&v.clientTlsCertificateConfigured===true&&
  v.freshTransportNonceSignatureVerified===true&&
  v.independentRuntimeClaimSignaturesVerified===true&&
  v.independentlyProvisionedWorkerVerified===false&&v.remoteProcessMeasured===false&&
  v.runtimeImageAttested===false&&v.immutableMountVerified===false&&
  v.singleUseChallengeConsumed===false&&v.buildExecutionAuthorized===false&&
  v.artifactProduced===false&&v.dispatchAllowed===false&&
  image.test(String(v.imageDigest))&&git.test(String(v.sourceSha))&&
  worker.test(String(v.workerId))&&run.test(String(v.runId))&&
  uuid.test(String(v.challengeId))&&uuid.test(String(v.acceptanceId))&&
  hex.test(String(v.transportNonceDigest))&&hex.test(String(v.runtimeEnvelopeDigest))&&
  hex.test(String(v.transportSignatureDigest))&&hex.test(String(v.serverSpkiSha256))&&
  typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s)&&
  Number.isFinite(Date.parse(s))&&new Date(Date.parse(s)).toISOString()===s&&
  Date.parse(s)>=Date.now()-30000&&Date.parse(s)<=Date.now()+5000;
};
/**
 * Internal-only V5.5.41 ledger. The caller must supply a fresh callback
 * that actually performs V5.5.40 pinned mTLS + signed-claim verification,
 * never an HTTP/partner-submitted receipt. The callback is invoked only
 * after live commercial checkpoint; the DB trigger rechecks authorization.
 * The durable ledger prevents a second use of the same TEST runtime probe
 * or accepted challenge. It does NOT attest the remote runtime or authorize
 * Android build execution, regardless of signed fixture claims.
 */
@Injectable()
export class PartnerAndroidRunnerRuntimeProbeLedgerService {
 constructor(
  private readonly licenses:PartnerLicenseLifecycleService,
  private readonly reservations:PartnerAndroidBuildReservationService
 ){}
 async record(principal:AuthPrincipal,societyId:string,proposalId:string,
  reservationId:string,consumptionId:string,acceptanceId:string,
  input:TestRuntimeProbeLedgerInput,probeOnce:()=>Promise<NonDispatchableRuntimeProbeReceipt>){
  if(!uuid.test(societyId)||!uuid.test(proposalId)||!uuid.test(reservationId)||
     !uuid.test(consumptionId)||!uuid.test(acceptanceId)||!uuid.test(input?.revisionId)||
     !hex.test(input?.expectedDigest)||!worker.test(input?.workerId)||
     !Number.isSafeInteger(input?.versionCode)||input.versionCode<1||
     input.versionCode>2100000000||typeof probeOnce!=='function')
   throw new BadRequestException('Invalid TEST runtime probe recording scope');
  const protectedWorker=process.env.AARAGATE_TEST_ANDROID_WORKER_ID;
  const protectedImage=process.env.AARAGATE_TEST_ANDROID_RUNNER_IMAGE_SHA256;
  const serverSpki=process.env.AARAGATE_TEST_ANDROID_RUNTIME_SERVER_SPKI_SHA256;
  if(protectedWorker!==input.workerId||!image.test(String(protectedImage))||
     !hex.test(String(serverSpki)))
   throw new ForbiddenException('Operator-pinned TEST runtime worker/transport not configured');
  await this.reservations.checkpoint(principal,societyId,proposalId,reservationId,{
   grantId:input.grantId,allocationId:input.allocationId,
   expectedGrantVersion:input.expectedGrantVersion,
   expectedOwnershipVersion:input.expectedOwnershipVersion,
   idempotencyKey:input.idempotencyKey,revisionId:input.revisionId,
   expectedDigest:input.expectedDigest,versionCode:input.versionCode,
   stage:'BEFORE_DISPATCH'
  });
  // Never accept a raw receipt as caller input; execute an internal verifier.
  const receipt:unknown=await probeOnce();
  if(!acceptedReceipt(receipt)||receipt.workerId!==protectedWorker||
     receipt.imageDigest!==protectedImage||receipt.serverSpkiSha256!==serverSpki||
     receipt.acceptanceId!==acceptanceId)
   throw new ForbiddenException('Runtime TEST probe signature/scope not accepted');
  try{
   return await this.licenses.withActiveAllocation(principal,societyId,input,async(tx,scope)=>{
    const accepted=await tx.partnerAndroidRunnerEvidenceAcceptance.findFirst({
     where:{id:acceptanceId,challengeId:receipt.challengeId},
     include:{challenge:{include:{consumption:{include:{claim:{include:{
      reservation:{include:{
       proposal:{include:{approval:{include:{revocation:true}}}},
       revision:{include:{approval:true}}
      }}
     }}}}}}}
    });
    if(!accepted||accepted.actorId!==principal.userId||
       accepted.workerId!==receipt.workerId||accepted.runId!==receipt.runId||
       accepted.imageDigest!==receipt.imageDigest||
       accepted.manifestDigest!==input.expectedDigest||
       accepted.sourceSha!==receipt.sourceSha||
       accepted.expiresAt.getTime()<=Date.now())
     throw new ConflictException('Accepted TEST worker proof expired or changed');
    const challenge=accepted.challenge,used=challenge.consumption,
     claim=used.claim,booking=claim.reservation,proposal=booking.proposal,
     revision=booking.revision;
    if(challenge.actorId!==principal.userId||
       challenge.id!==receipt.challengeId||challenge.workerId!==receipt.workerId||
       challenge.runId!==receipt.runId||challenge.imageDigest!==receipt.imageDigest||
       challenge.manifestDigest!==input.expectedDigest||
       challenge.consumptionId!==consumptionId||
       challenge.expiresAt.getTime()<=Date.now()||
       used.actorId!==principal.userId||used.workerId!==receipt.workerId||
       used.manifestDigest!==input.expectedDigest||
       used.versionCode!==input.versionCode||
       used.sourceSha!==receipt.sourceSha||
       claim.actorId!==principal.userId||claim.expiresAt.getTime()<=Date.now()||
       booking.id!==reservationId||booking.proposalId!==proposalId||
       booking.versionCode!==input.versionCode||
       booking.digest!==input.expectedDigest||
       proposal.allocationId!==scope.allocationId||!proposal.approval||
       proposal.approval.revocation||proposal.digest!==digest(proposal.manifest))
     throw new ConflictException('Commercial TEST runner acceptance or consumption changed');
    const newest=await tx.partnerAndroidBuildRevision.findFirst({
     where:{proposalId},orderBy:{version:'desc'},select:{id:true}
    });
    const m=revision.manifest as Record<string,unknown>;
    if(!newest||newest.id!==revision.id||!revision.approval||
       revision.id!==input.revisionId||revision.digest!==input.expectedDigest||
       revision.digest!==digest(revision.manifest)||
       m.buildMode!=='TEST'||m.societyId!==societyId||
       m.partnerId!==scope.partnerId||m.distributionId!==proposalId||
       m.sourceSha!==receipt.sourceSha||m.lockDigest!==used.lockDigest)
     throw new ConflictException('TEST build revision or approved source changed');
    const record=await tx.partnerAndroidRunnerRuntimeProbe.create({data:{
     acceptanceId,challengeId:receipt.challengeId,actorId:principal.userId,
     workerId:receipt.workerId,runId:receipt.runId,
     imageDigest:receipt.imageDigest,sourceSha:receipt.sourceSha,
     manifestDigest:input.expectedDigest,
     transportNonceDigest:receipt.transportNonceDigest,
     runtimeEnvelopeDigest:receipt.runtimeEnvelopeDigest,
     transportSignatureDigest:receipt.transportSignatureDigest,
     serverSpkiSha256:receipt.serverSpkiSha256,
     verifiedAt:new Date(receipt.verifiedAt)
    },select:{id:true}});
    return {id:record.id,acceptanceId,challengeId:receipt.challengeId,
     status:'RUNTIME_TEST_PROBE_LEDGERED_NO_EXECUTION' as const,
     testOnly:true as const,dbReplayBarrierVerified:true as const,
     // A committed nonce digest cannot be reused, but does NOT consume
     // any future independent execution challenge.
     singleUseChallengeConsumed:false as const,
     runtimeImageAttested:false as const,remoteProcessMeasured:false as const,
     independentlyProvisionedWorkerVerified:false as const,
     buildExecutionAuthorized:false as const,artifactProduced:false as const,
     dispatchAllowed:false as const};
   });
  }catch(e){
   if(e instanceof Prisma.PrismaClientKnownRequestError&&
      ['P2002','P2003','P2004'].includes(e.code))
    throw new ConflictException('Runtime TEST probe already recorded or invalid');
   throw e;
  }
 }
}
