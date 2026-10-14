import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AuthPrincipal } from '../auth/auth.types';
import { LicenseContextInput, PartnerLicenseLifecycleService, canonicalLicenseJson } from './partner-license-lifecycle.service';

type ReservationContext = LicenseContextInput & { allocationId:string; revisionId:string; expectedDigest:string };
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hex=/^[0-9a-f]{64}$/;
const hash=(value:unknown)=>createHash('sha256').update(canonicalLicenseJson(value)).digest('hex');

/** Monotonic immutable TEST versionCode reservations, never an executable build queue.
 * Dispatch/completion must be a later trusted builder operation which rechecks the
 * exact allocation and approval, source/asset verification and signed artifacts. */
@Injectable()
export class PartnerAndroidBuildReservationService {
 constructor(private readonly licenses:PartnerLicenseLifecycleService) {}

 async reserve(principal:AuthPrincipal,societyId:string,proposalId:string,input:ReservationContext) {
  if(!uuid.test(proposalId)||!uuid.test(input.revisionId)||!hex.test(input.expectedDigest))
   throw new BadRequestException('Invalid Android TEST reservation reference');
  try {
   return await this.licenses.withActiveAllocation(principal,societyId,input,async(tx,scope)=>{
    // The same proposal row serializes all concurrent reservations for a single
    // installation identity, including different idempotency keys.
    await tx.$queryRaw`SELECT "id" FROM "PartnerDistributionProposal" WHERE "id"=${proposalId}::uuid FOR UPDATE`;
    const proposal=await tx.partnerDistributionProposal.findFirst({
     where:{id:proposalId,allocationId:scope.allocationId},
     include:{approval:{include:{revocation:true}}}
    });
    if(!proposal?.approval||proposal.approval.revocation)throw new NotFoundException('Current TEST distribution approval unavailable');
    if(proposal.digest!==hash(proposal.manifest))throw new ConflictException('Initial distribution digest changed');
    const revision=await tx.partnerAndroidBuildRevision.findFirst({
     where:{proposalId},orderBy:{version:'desc'},include:{approval:true}
    });
    if(!revision||revision.id!==input.revisionId||!revision.approval)
     throw new ConflictException('Latest independently reviewed Android revision required');
    if(revision.digest!==input.expectedDigest||revision.digest!==hash(revision.manifest))
     throw new ConflictException('Android revision digest changed');
    const m=revision.manifest as Record<string,unknown>;
    const original=proposal.manifest as Record<string,unknown>;
    if(m.buildMode!=='TEST'||m.distributionId!==proposalId||m.approvalId!==proposal.approval.id||
     m.societyId!==societyId||m.partnerId!==scope.partnerId||
     m.applicationId!==original.applicationId||m.namespace!==original.namespace||
     m.appRole!==original.appRole||m.signingProfile!==original.signingProfile)
     throw new ConflictException('Reserved Android identity differs from approved TEST distribution');
    const replay=await tx.partnerAndroidBuildReservation.findUnique({
     where:{proposalId_idempotencyKey:{proposalId,idempotencyKey:input.idempotencyKey}}
    });
    if(replay) {
     if(replay.actorId!==principal.userId||replay.revisionId!==revision.id||replay.digest!==revision.digest)
      throw new ConflictException('Android build reservation request key changed');
     return {id:replay.id,versionCode:replay.versionCode,revisionId:revision.id,digest:revision.digest,
      status:'RESERVED_TEST_ONLY' as const,testOnly:true as const,dispatchAllowed:false as const};
    }
    const last=await tx.partnerAndroidBuildReservation.findFirst({
     where:{proposalId},orderBy:{versionCode:'desc'},select:{versionCode:true}
    });
    const versionCode=(last?.versionCode??0)+1;
    if(versionCode>2100000000)throw new ConflictException('Android versionCode exhausted');
    const reserved=await tx.partnerAndroidBuildReservation.create({data:{
     proposalId,revisionId:revision.id,actorId:principal.userId,
     idempotencyKey:input.idempotencyKey,versionCode,digest:revision.digest
    },select:{id:true,versionCode:true}});
    return {...reserved,revisionId:revision.id,digest:revision.digest,
     status:'RESERVED_TEST_ONLY' as const,testOnly:true as const,dispatchAllowed:false as const};
   });
  }catch(error){
   if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')
    throw new ConflictException('Concurrent Android version reservation conflict');
   throw error;
  }
 }
}
