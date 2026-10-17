import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AuthPrincipal } from '../auth/auth.types';
import { LicenseContextInput, PartnerLicenseLifecycleService, canonicalLicenseJson } from './partner-license-lifecycle.service';
import { PartnerAndroidBuildReservationService } from './partner-android-build-reservation.service';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hex=/^[0-9a-f]{64}$/;
const source=/^[0-9a-f]{40}$/;
const worker=/^TEST_WORKER_[A-Z0-9_]{3,48}$/;
const run=/^TEST_RUN_[A-Z0-9_]{3,48}$/;
const fields=['schemaVersion','environment','workerId','runId','imageDigest',
 'distributionId','reservationId','revisionId','consumptionId','manifestDigest',
 'appRole','sourceSha','lockDigest','versionCode','nativeInventoryDigest',
 'toolchainReceiptDigest','nonce','issuedAt','expiresAt'];
type TestStatement={
 schemaVersion:number;environment:string;workerId:string;runId:string;
 imageDigest:string;distributionId:string;reservationId:string;
 revisionId:string;consumptionId:string;manifestDigest:string;appRole:string;
 sourceSha:string;lockDigest:string;versionCode:number;
 nativeInventoryDigest:string;toolchainReceiptDigest:string;nonce:string;
 issuedAt:string;expiresAt:string
};
export type TestRunnerEvidenceAcceptanceInput=LicenseContextInput&{
 allocationId:string;revisionId:string;expectedDigest:string;
 versionCode:number;workerId:string;statement:TestStatement;signature:string
};
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const digest=(value:unknown)=>sha(canonicalLicenseJson(value));
function strictKeys(value:unknown,keys:string[]):value is Record<string,unknown>{
 return value!==null && typeof value==='object' && !Array.isArray(value) &&
  Object.getPrototypeOf(value)===Object.prototype &&
  Object.keys(value).sort().join(',')===keys.slice().sort().join(',');
}
function canonical(value:unknown):string{
 if(value===null || typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(Object.getPrototypeOf(value)!==Object.prototype)throw new BadRequestException('Invalid TEST runner payload object');
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
}
function date(value:unknown):Date{
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value))
  throw new BadRequestException('Invalid signed TEST assertion time');
 const d=new Date(value);
 if(!Number.isFinite(d.getTime()) || d.toISOString().slice(0,19)!==value.slice(0,19))
  throw new BadRequestException('Invalid signed TEST assertion time');
 return d;
}
/**
 * Persist one valid V5.5.13 TEST worker signature for an issued V5.5.14
 * challenge exactly once; unique DB constraints/trigger enforce atomicity.
 * No HTTP controller and NO executable build dispatch/artifact acceptance.
 */
@Injectable()
export class PartnerAndroidRunnerEvidenceAcceptanceService {
 constructor(
  private readonly licenses:PartnerLicenseLifecycleService,
  private readonly reservations:PartnerAndroidBuildReservationService
 ) {}
 async accept(principal:AuthPrincipal,societyId:string,proposalId:string,
  reservationId:string,consumptionId:string,challengeId:string,
  input:TestRunnerEvidenceAcceptanceInput){
  const p=input?.statement;
  if(!uuid.test(societyId)||!uuid.test(proposalId)||!uuid.test(reservationId)||
     !uuid.test(consumptionId)||!uuid.test(challengeId)||!uuid.test(input?.revisionId)||
     !hex.test(input?.expectedDigest)||!worker.test(input?.workerId)||
     !Number.isSafeInteger(input?.versionCode)||input.versionCode<1||input.versionCode>2100000000||
     !strictKeys(p,fields))
   throw new BadRequestException('Invalid TEST runner evidence references');
  if(p.schemaVersion!==1||p.environment!=='TEST'||
     !worker.test(p.workerId)||!run.test(p.runId)||!uuid.test(p.distributionId)||
     !uuid.test(p.reservationId)||!uuid.test(p.revisionId)||!uuid.test(p.consumptionId)||
     !/^sha256:[0-9a-f]{64}$/.test(p.imageDigest)||
     !hex.test(p.manifestDigest)||!source.test(p.sourceSha)||
     !hex.test(p.lockDigest)||!hex.test(p.nonce)||
     !hex.test(p.nativeInventoryDigest)||!hex.test(p.toolchainReceiptDigest)||
     !['RESIDENT','GUARD'].includes(p.appRole)||
     !Number.isSafeInteger(p.versionCode)||p.versionCode<1||p.versionCode>2100000000||
     p.distributionId!==proposalId||p.reservationId!==reservationId||
     p.revisionId!==input.revisionId||p.consumptionId!==consumptionId||
     p.manifestDigest!==input.expectedDigest||p.workerId!==input.workerId||
     p.versionCode!==input.versionCode)
   throw new ForbiddenException('TEST runner statement identity mismatch');
  const issued=date(p.issuedAt),expiry=date(p.expiresAt),now=Date.now();
  if(issued.getTime()<now-30000||issued.getTime()>now+5000||
     expiry.getTime()<=now||expiry.getTime()<=issued.getTime()||
     expiry.getTime()>issued.getTime()+90000)
   throw new ForbiddenException('Expired TEST runner signed assertion');
  const publicPem=process.env.AARAGATE_TEST_ANDROID_WORKER_ED25519_PUBLIC_KEY_PEM;
  const configuredId=process.env.AARAGATE_TEST_ANDROID_WORKER_ID;
  const configuredImage=process.env.AARAGATE_TEST_ANDROID_RUNNER_IMAGE_SHA256;
  if(typeof publicPem!=='string'||!publicPem.startsWith('-----BEGIN PUBLIC KEY-----\n')||
     configuredId!==p.workerId||configuredImage!==p.imageDigest)
   throw new ForbiddenException('Independent TEST worker signature policy not configured');
  if(typeof input.signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(input.signature))
   throw new ForbiddenException('Invalid TEST runner evidence signature');
  const rawSignature=Buffer.from(input.signature,'base64url');
  if(rawSignature.length!==64||rawSignature.toString('base64url')!==input.signature)
   throw new ForbiddenException('Noncanonical signed worker proof');
  let key;
  try{key=createPublicKey(publicPem);}catch{
   throw new ForbiddenException('Invalid configured TEST worker public key');
  }
  const bytes=Buffer.from('aaraagate:v5.5.13:runner-evidence:v1\n'+canonical(p),'utf8');
  if(key.asymmetricKeyType!=='ed25519'||!verifySignature(null,bytes,key,rawSignature))
   throw new ForbiddenException('TEST worker Ed25519 proof is untrusted');

  // A fresh checkpoint precedes a transaction rechecking the immutable
  // distribution and existing challenge against current commercial scope.
  await this.reservations.checkpoint(principal,societyId,proposalId,reservationId,{
   grantId:input.grantId,allocationId:input.allocationId,
   expectedGrantVersion:input.expectedGrantVersion,
   expectedOwnershipVersion:input.expectedOwnershipVersion,
   idempotencyKey:input.idempotencyKey,revisionId:input.revisionId,
   expectedDigest:input.expectedDigest,versionCode:input.versionCode,stage:'BEFORE_DISPATCH'
  });
  try{
   return await this.licenses.withActiveAllocation(principal,societyId,input,async(tx,scope)=>{
    const challenge=await tx.partnerAndroidRunnerChallenge.findFirst({
     where:{id:challengeId,consumptionId},
     include:{consumption:{include:{claim:{include:{reservation:{include:{
      proposal:{include:{approval:{include:{revocation:true}}}},
      revision:{include:{approval:true}}
     }}}}}}}
    });
    if(!challenge || challenge.actorId!==principal.userId||
       challenge.workerId!==p.workerId||challenge.runId!==p.runId||
       challenge.imageDigest!==p.imageDigest||
       challenge.nonceDigest!==sha(p.nonce)||
       challenge.manifestDigest!==p.manifestDigest||
       challenge.versionCode!==p.versionCode||
       challenge.issuedAt.getTime()>issued.getTime()+5000||
       challenge.expiresAt.getTime()<expiry.getTime()||
       challenge.expiresAt.getTime()<=Date.now())
     throw new ConflictException('TEST runner challenge is foreign, stale or expired');
    const used=challenge.consumption,claim=used.claim,receipt=claim.reservation,
      proposal=receipt.proposal,revision=receipt.revision;
    if(used.actorId!==principal.userId||claim.actorId!==principal.userId||
       used.workerId!==p.workerId||claim.workerId!==p.workerId||
       used.manifestDigest!==p.manifestDigest||used.versionCode!==p.versionCode||
       used.sourceSha!==p.sourceSha||used.lockDigest!==p.lockDigest||
       claim.expiresAt.getTime()<=Date.now()||
       receipt.id!==reservationId||receipt.proposalId!==proposalId||
       receipt.versionCode!==p.versionCode||receipt.digest!==p.manifestDigest||
       proposal.allocationId!==scope.allocationId||!proposal.approval||
       proposal.approval.revocation||proposal.digest!==digest(proposal.manifest))
     throw new ConflictException('Consumed TEST worker or commercial allocation changed');
    const latest=await tx.partnerAndroidBuildRevision.findFirst({
     where:{proposalId},orderBy:{version:'desc'},select:{id:true}
    });
    const m=revision.manifest as Record<string,unknown>;
    if(!latest||latest.id!==revision.id||!revision.approval||
       revision.id!==p.revisionId||revision.digest!==p.manifestDigest||
       revision.digest!==digest(revision.manifest)||
       m.buildMode!=='TEST'||m.appRole!==p.appRole||
       m.distributionId!==proposalId||m.societyId!==societyId||
       m.partnerId!==scope.partnerId||m.sourceSha!==p.sourceSha||
       m.lockDigest!==p.lockDigest)
     throw new ConflictException('Reviewed TEST source, version or identity changed');
    const row=await tx.partnerAndroidRunnerEvidenceAcceptance.create({data:{
     challengeId,actorId:principal.userId,workerId:p.workerId,
     runId:p.runId,nonceDigest:sha(p.nonce),
     imageDigest:p.imageDigest,manifestDigest:p.manifestDigest,
     sourceSha:p.sourceSha,lockDigest:p.lockDigest,
     nativeInventoryDigest:p.nativeInventoryDigest,
     toolchainReceiptDigest:p.toolchainReceiptDigest,
     signatureDigest:createHash('sha256').update(rawSignature).digest('hex'),
     versionCode:p.versionCode,issuedAt:issued,expiresAt:expiry
    },select:{id:true}});
    return {id:row.id,challengeId,consumptionId,runId:p.runId,
     status:'SIGNED_TEST_EVIDENCE_ACCEPTED_NO_EXECUTION' as const,
     workerSignatureVerified:true as const,serverReplayBarrierVerified:true as const,
     testOnly:true as const,dispatchAllowed:false as const,
     runnerTransportAuthenticated:false as const,runtimeImageAttested:false as const,
     flutterSdkTreeVerified:false as const,artifactProduced:false as const,
     archiveVerified:false as const,requiresTrustedRunnerTransport:true as const};
   });
  }catch(error){
   if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')
    throw new ConflictException('TEST runner signed proof already accepted');
   throw error;
  }
 }
}
