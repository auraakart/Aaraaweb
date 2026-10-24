import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { validAndroidIdentity } from '@aaraagate/config/android-identity';
import { PrismaService } from '../prisma/prisma.service';
import { PartnerBrandService } from './partner-brand.service';
import { PartnerLicenseLifecycleService, LicenseContextInput } from '../entitlements/partner-license-lifecycle.service';
import { SocietyOwnershipTransferService } from '../entitlements/society-ownership-transfer.service';
import { AuthPrincipal } from '../auth/auth.types';

type Context = LicenseContextInput & { allocationId: string };
@Injectable()
export class PartnerApplicationService {
 constructor(private readonly prisma:PrismaService,private readonly brands:PartnerBrandService,
  private readonly licenses:PartnerLicenseLifecycleService,private readonly ownership:SocietyOwnershipTransferService) {}
 list(actorId:string,partnerId:string) {
  return this.prisma.$transaction(async tx=>{
   await this.brands.authorize(tx,actorId,partnerId);
   const rows=await tx.partnerApplication.findMany({where:{partnerId},orderBy:{id:'asc'},take:51,
    select:{id:true,applicationId:true,appRole:true,signerFingerprint:true,createdAt:true,_count:{select:{scopes:true}}}});
   return {applications:rows.slice(0,50),hasMore:rows.length>50,testOnly:true,dispatchAllowed:false};
  });
 }
 register(actorId:string,partnerId:string,input:{applicationId:string;appRole:'RESIDENT'|'GUARD';signerFingerprint:string}) {
  if(!validAndroidIdentity(input.applicationId)||!['RESIDENT','GUARD'].includes(input.appRole)||!/^[0-9a-f]{64}$/.test(input.signerFingerprint))throw new BadRequestException('Invalid partner application identity');
  return this.prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT "id" FROM "Partner" WHERE "id"=${partnerId}::uuid FOR UPDATE`;
   await this.brands.authorize(tx,actorId,partnerId,true);
   const existing=await tx.partnerApplication.findUnique({where:{applicationId:input.applicationId}});
   if(existing){
    if(existing.partnerId!==partnerId||existing.appRole!==input.appRole||existing.signerFingerprint!==input.signerFingerprint)throw new ConflictException('Application identity already reserved');
    return {...existing,testOnly:true,dispatchAllowed:false};
   }
   if(await tx.partnerDistributionProposal.findUnique({where:{applicationId:input.applicationId},select:{id:true}}))throw new ConflictException('Legacy distribution identity requires separate migration');
   const count=await tx.partnerApplication.count({where:{partnerId}});
   if(count>=50)throw new ConflictException('Partner application limit reached');
   try { return {...await tx.partnerApplication.create({data:{partnerId,...input,createdById:actorId}}),testOnly:true,dispatchAllowed:false}; }
   catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')throw new ConflictException('Application identity already reserved');throw error;}
  });
 }
 societyScopes(principal:AuthPrincipal,societyId:string) {
  return this.ownership.withAuthorizedSociety(principal,societyId,async(tx,owner)=>{
   const [applications,scopes]=await Promise.all([
    tx.partnerApplication.findMany({where:{partnerId:owner.partnerId},select:{id:true,applicationId:true,appRole:true},orderBy:{id:'asc'},take:51}),
    tx.partnerApplicationScope.findMany({where:{societyId},orderBy:{createdAt:'desc'},take:101}),
   ]);
   return {applications:applications.slice(0,50),scopes:scopes.slice(0,100),hasMore:applications.length>50||scopes.length>100};
  });
 }
 proposeScope(principal:AuthPrincipal,societyId:string,applicationId:string,input:Context) {
  return this.licenses.withActiveAllocation(principal,societyId,input,async(tx,scope)=>{
   const app=await tx.partnerApplication.findFirst({where:{id:applicationId,partnerId:scope.partnerId}});
   if(!app)throw new NotFoundException('Partner application unavailable');
   const old=await tx.partnerApplicationScope.findUnique({where:{applicationId_allocationId:{applicationId,allocationId:input.allocationId}}});
   if(old){if(old.createdById!==principal.userId)throw new ConflictException('Scope already proposed');return old;}
   return tx.partnerApplicationScope.create({data:{applicationId,societyId,allocationId:input.allocationId,ownershipVersion:input.expectedOwnershipVersion,createdById:principal.userId}});
  });
 }
 approveScope(principal:AuthPrincipal,societyId:string,applicationId:string,scopeId:string,input:Context) {
  return this.licenses.withActiveAllocation(principal,societyId,input,async(tx,allocation)=>{
   await tx.$queryRaw`SELECT "id" FROM "PartnerApplicationScope" WHERE "id"=${scopeId}::uuid FOR UPDATE`;
   const scope=await tx.partnerApplicationScope.findFirst({where:{id:scopeId,applicationId,societyId,allocationId:input.allocationId,ownershipVersion:input.expectedOwnershipVersion,application:{is:{partnerId:allocation.partnerId}}}});
   if(!scope||scope.revokedAt)throw new NotFoundException('Application scope unavailable');
   if(scope.createdById===principal.userId)throw new ForbiddenException('Independent scope approval required');
   if(scope.approvedById){if(scope.approvedById!==principal.userId)throw new ConflictException('Scope already reviewed');return scope;}
   const makers=await tx.$queryRaw<{id:string}[]>`SELECT m."id" FROM "SocietyMembership" m JOIN "User" u ON u."id"=m."userId" WHERE m."userId"=${scope.createdById}::uuid AND m."societyId"=${societyId}::uuid AND m."active"=true AND m."role"='SUPER_ADMIN' AND u."status"='ACTIVE' FOR SHARE OF m,u`;
   if(!makers.length)throw new ForbiddenException('Scope proposer authority unavailable');
   const [identities,legacyUsed]=await Promise.all([
    tx.partnerApplicationScope.findMany({where:{approvedAt:{not:null},revokedAt:null,allocation:{is:{approvalId:allocation.approvalId}}},distinct:['applicationId'],select:{applicationId:true}}),
    tx.partnerDistributionApproval.count({where:{revocation:null,proposal:{allocation:{approvalId:allocation.approvalId}}}}),
   ]);
   if(!identities.some(identity=>identity.applicationId===applicationId)&&identities.length+legacyUsed>=allocation.maximumDistributions)
    throw new ConflictException('Licensed application capacity exhausted');
   return tx.partnerApplicationScope.update({where:{id:scope.id},data:{approvedById:principal.userId,approvedAt:new Date()}});
  });
 }
 revokeScope(principal:AuthPrincipal,societyId:string,applicationId:string,scopeId:string) {
  return this.ownership.withAuthorizedSociety(principal,societyId,async tx=>{
   const scope=await tx.partnerApplicationScope.findFirst({where:{id:scopeId,applicationId,societyId}});
   if(!scope)throw new NotFoundException('Application scope unavailable');
   await tx.partnerApplicationScope.updateMany({where:{id:scope.id,revokedAt:null},data:{revokedAt:new Date(),revokedById:principal.userId}});
   return {id:scope.id,revoked:true};
  });
 }
}
