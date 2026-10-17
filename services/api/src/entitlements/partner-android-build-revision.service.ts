import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AuthPrincipal } from '../auth/auth.types';
import { LicenseContextInput, PartnerLicenseLifecycleService, canonicalLicenseJson } from './partner-license-lifecycle.service';

type Context = LicenseContextInput & { allocationId: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hex = /^[0-9a-f]{64}$/;
const pkg = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/;
const reserved = /^(com\.example|com\.aaraagate|in\.aaraagate|com\.aaraaweb|com\.aaraaplatforms)(\.|$)/;
const javaWords = new Set('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null _'.split(' '));
const keys = ['schemaVersion','distributionId','approvalId','partnerId','societyId','brandRevision','sourceSha','lockDigest','applicationId','namespace','appRole','label','buildMode','apiOrigin','configDigest','assetDigests','firebaseClientRef','appLinkHosts','signingProfile','signerFingerprint'];
const hash = (value:unknown) => createHash('sha256').update(canonicalLicenseJson(value)).digest('hex');

/** Persist test-only revision evidence. Neither approval nor retrieval dispatches a build. */
@Injectable()
export class PartnerAndroidBuildRevisionService {
 constructor(private readonly licenses: PartnerLicenseLifecycleService) {}

 private manifest(value:unknown):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new BadRequestException('Invalid TEST Android revision');
  const m=value as Record<string,unknown>;
  if(Object.keys(m).length!==keys.length||Object.keys(m).some(k=>!keys.includes(k))||
   m.schemaVersion!==1||m.buildMode!=='TEST'||!['RESIDENT','GUARD'].includes(String(m.appRole))||
   !Number.isSafeInteger(m.brandRevision)||(m.brandRevision as number)<1||(m.brandRevision as number)>2147483647||
   !['distributionId','approvalId','partnerId','societyId'].every(k=>typeof m[k]==='string'&&uuid.test(m[k] as string))||
   typeof m.applicationId!=='string'||m.applicationId.length>150||!pkg.test(m.applicationId)||reserved.test(m.applicationId)||
   m.namespace!==m.applicationId||m.applicationId.split('.').some(p=>javaWords.has(p))||
   typeof m.label!=='string'||m.label.trim()!==m.label||m.label.length<1||m.label.length>60||
   /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069<>]/.test(m.label)||
   typeof m.sourceSha!=='string'||!/^[0-9a-f]{40}$/.test(m.sourceSha)||
   !['lockDigest','configDigest','signerFingerprint'].every(k=>typeof m[k]==='string'&&hex.test(m[k] as string))||
   typeof m.signingProfile!=='string'||!/^TEST_[A-Z0-9_]{3,60}$/.test(m.signingProfile)||
   typeof m.firebaseClientRef!=='string'||!/^TEST_[A-Z0-9_]{3,60}$/.test(m.firebaseClientRef)||
   !m.assetDigests||typeof m.assetDigests!=='object'||Array.isArray(m.assetDigests)||
   Object.keys(m.assetDigests).sort().join(',')!=='icon,splash'||
   !Object.values(m.assetDigests).every(v=>typeof v==='string'&&hex.test(v))||
   !Array.isArray(m.appLinkHosts)||m.appLinkHosts.length>5||new Set(m.appLinkHosts).size!==m.appLinkHosts.length||
   m.appLinkHosts.some(h=>typeof h!=='string'||h.length>253||!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(h))||
   typeof m.apiOrigin!=='string')throw new BadRequestException('Unsafe TEST Android revision');
  try {
   const u=new URL(m.apiOrigin);
   const allow:unknown=JSON.parse(process.env.AARAGATE_TEST_BUILD_API_ORIGINS??'[]');
   if(u.protocol!=='https:'||u.origin!==m.apiOrigin||!Array.isArray(allow)||allow.length>20||
    !allow.every(x=>typeof x==='string')||!allow.includes(m.apiOrigin))throw Error();
  }catch{throw new BadRequestException('TEST API origin not allowlisted');}
  return m;
 }
 private reason(value:string) {
  if(typeof value!=='string'||value.trim().length<3||value.trim().length>500)throw new BadRequestException('Invalid revision review reason');
  return value.trim();
 }
 private bound(p:{manifest:Prisma.JsonValue;digest:string;approval:{id:string;revocation:unknown}|null},
  proposalId:string,partnerId:string,societyId:string,m:Record<string,unknown>) {
  if(!p.approval||p.approval.revocation)throw new NotFoundException('Current distribution approval unavailable');
  if(p.digest!==hash(p.manifest))throw new ConflictException('Initial distribution digest changed');
  const original=p.manifest as Record<string,unknown>;
  if(m.distributionId!==proposalId||m.approvalId!==p.approval.id||m.partnerId!==partnerId||m.societyId!==societyId||
   m.applicationId!==original.applicationId||m.namespace!==original.namespace||m.appRole!==original.appRole||
   m.signingProfile!==original.signingProfile)throw new ConflictException('Immutable Android identity changed');
 }

 async propose(principal:AuthPrincipal,societyId:string,proposalId:string,input:Context & {manifest:unknown}) {
  if(!uuid.test(proposalId))throw new BadRequestException('Invalid distribution reference');
  const m=this.manifest(input.manifest), d=hash(m);
  try {
   return await this.licenses.withActiveAllocation(principal,societyId,input,async(tx,scope)=>{
    await tx.$queryRaw`SELECT "id" FROM "PartnerDistributionProposal" WHERE "id"=${proposalId}::uuid FOR UPDATE`;
    const p=await tx.partnerDistributionProposal.findFirst({where:{id:proposalId,allocationId:scope.allocationId},include:{approval:{include:{revocation:true}}}});
    if(!p)throw new NotFoundException('Distribution unavailable');
    this.bound(p,proposalId,scope.partnerId,societyId,m);
    const old=await tx.partnerAndroidBuildRevision.findUnique({where:{proposalId_idempotencyKey:{proposalId,idempotencyKey:input.idempotencyKey}}});
    if(old) {
     if(old.actorId!==principal.userId||old.digest!==d||canonicalLicenseJson(old.manifest)!==canonicalLicenseJson(m))
      throw new ConflictException('Build revision key changed');
     return {id:old.id,version:old.version,digest:old.digest,status:'UNVERIFIED_TEST_REVISION' as const,dispatchAllowed:false as const};
    }
    const latest=await tx.partnerAndroidBuildRevision.findFirst({where:{proposalId},orderBy:{version:'desc'},include:{approval:true}});
    if(latest&&!latest.approval)throw new ConflictException('Prior revision requires independent review');
    if(latest&&(latest.manifest as Record<string,unknown>).signerFingerprint!==m.signerFingerprint)
     throw new ConflictException('Android update signer cannot change');
    const version=(latest?.version??0)+1;
    if(version>2147483647)throw new ConflictException('Revision sequence exhausted');
    const created=await tx.partnerAndroidBuildRevision.create({data:{
     proposalId,version,actorId:principal.userId,idempotencyKey:input.idempotencyKey,
     manifest:m as Prisma.InputJsonValue,digest:d
    },select:{id:true,version:true,digest:true}});
    return {...created,status:'UNVERIFIED_TEST_REVISION' as const,dispatchAllowed:false as const};
   });
  }catch(err){
   if(err instanceof Prisma.PrismaClientKnownRequestError&&err.code==='P2002')
    throw new ConflictException('Build revision identity/version conflict');
   throw err;
  }
 }

 async approve(principal:AuthPrincipal,societyId:string,proposalId:string,revisionId:string,
  input:Context & {expectedDigest:string;reason:string}) {
  if(!uuid.test(proposalId)||!uuid.test(revisionId)||!hex.test(input.expectedDigest))
   throw new BadRequestException('Invalid revision approval reference');
  const reason=this.reason(input.reason);
  return this.licenses.withActiveAllocation(principal,societyId,input,async(tx,scope)=>{
   await tx.$queryRaw`SELECT "id" FROM "PartnerDistributionProposal" WHERE "id"=${proposalId}::uuid FOR UPDATE`;
   const p=await tx.partnerDistributionProposal.findFirst({where:{id:proposalId,allocationId:scope.allocationId},include:{approval:{include:{revocation:true}}}});
   if(!p)throw new NotFoundException('Distribution unavailable');
   const r=await tx.partnerAndroidBuildRevision.findFirst({where:{id:revisionId,proposalId},include:{approval:true}});
   if(!r)throw new NotFoundException('Build revision unavailable');
   const m=this.manifest(r.manifest);
   this.bound(p,proposalId,scope.partnerId,societyId,m);
   if(r.digest!==input.expectedDigest||r.digest!==hash(m))throw new ConflictException('Build revision digest changed');
   if(r.actorId===principal.userId)throw new ForbiddenException('Independent revision reviewer required');
   const makers=await tx.$queryRaw<{id:string}[]>`SELECT u."id" FROM "User" u JOIN "SocietyMembership" mem ON mem."userId"=u."id"
     WHERE u."id"=${r.actorId}::uuid AND u."status"='ACTIVE' AND mem."societyId"=${societyId}::uuid
       AND mem."active"=true AND mem."role"='SUPER_ADMIN' FOR SHARE OF u,mem`;
   if(!makers.length)throw new ForbiddenException('Revision maker no longer authorized');
   const latest=await tx.partnerAndroidBuildRevision.findFirst({where:{proposalId},orderBy:{version:'desc'},select:{id:true}});
   if(latest?.id!==r.id)throw new ConflictException('Superseded revision');
   if(r.approval){
    if(r.approval.actorId!==principal.userId||r.approval.idempotencyKey!==input.idempotencyKey||
     r.approval.reason!==reason)throw new ConflictException('Revision review key changed');
    return {id:r.approval.id,version:r.version,digest:r.digest,status:'REVIEWED_TEST_REVISION' as const,dispatchAllowed:false as const};
   }
   const reviewed=await tx.partnerAndroidBuildRevisionApproval.create({data:{
    revisionId:r.id,actorId:principal.userId,idempotencyKey:input.idempotencyKey,reason
   },select:{id:true}});
   return {...reviewed,version:r.version,digest:r.digest,status:'REVIEWED_TEST_REVISION' as const,dispatchAllowed:false as const};
  });
 }

 async latest(principal:AuthPrincipal,societyId:string,proposalId:string,input:Context) {
  if(!uuid.test(proposalId))throw new BadRequestException('Invalid distribution reference');
  return this.licenses.withActiveAllocation(principal,societyId,input,async(tx,scope)=>{
   const p=await tx.partnerDistributionProposal.findFirst({where:{id:proposalId,allocationId:scope.allocationId},include:{approval:{include:{revocation:true}}}});
   if(!p?.approval||p.approval.revocation)throw new NotFoundException('Distribution approval unavailable');
   const r=await tx.partnerAndroidBuildRevision.findFirst({where:{proposalId},orderBy:{version:'desc'},include:{approval:true}});
   if(!r?.approval)throw new NotFoundException('Latest reviewed revision unavailable');
   const manifest=this.manifest(r.manifest);
   this.bound(p,proposalId,scope.partnerId,societyId,manifest);
   if(r.digest!==hash(manifest))throw new ConflictException('Revision digest changed');
   return {revisionId:r.id,version:r.version,digest:r.digest,manifest,
    status:'REVIEWED_TEST_REVISION' as const,requiresBuilderRevalidation:true as const,dispatchAllowed:false as const};
  });
 }
}
