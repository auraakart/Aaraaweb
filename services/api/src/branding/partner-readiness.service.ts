import { createHash } from 'node:crypto';
import { canonicalLicenseJson } from '../entitlements/partner-license-lifecycle.service';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PartnerBrandService, partnerBrandConfig } from './partner-brand.service';
import { applicationPushRoutes } from '../notifications/application-push-routing';
@Injectable()
export class PartnerReadinessService {
 constructor(private readonly prisma:PrismaService,private readonly brands:PartnerBrandService){}
 read(actorId:string,partnerId:string){
  return this.prisma.$transaction(async tx=>{
   await this.brands.authorize(tx,actorId,partnerId);
   const now=new Date(),soon=new Date(now.getTime()+7*86400000);
   const [brand,verifiedDomains,expiringDomains,applications,pendingScopes,approvedScopes,grants]=await Promise.all([
    tx.partnerBrandRevision.findFirst({where:{partnerId,publishedAt:{not:null}},orderBy:[{publishedAt:'desc'},{version:'desc'}]}),
    tx.partnerDomainClaim.count({where:{partnerId,status:'VERIFIED',verifiedUntil:{gt:now}}}),
    tx.partnerDomainClaim.count({where:{partnerId,status:'VERIFIED',verifiedUntil:{gt:now,lte:soon}}}),
    tx.partnerApplication.findMany({where:{partnerId},select:{id:true,applicationId:true,appRole:true,signerFingerprint:true},orderBy:{id:'asc'},take:51}),
    tx.partnerApplicationScope.count({where:{application:{is:{partnerId}},approvedAt:null,revokedAt:null}}),
    tx.partnerApplicationScope.count({where:{application:{is:{partnerId}},approvedAt:{not:null},revokedAt:null}}),
    tx.partnerLicenseGrant.findMany({where:{partnerId,startsAt:{lte:now},endsAt:{gt:now},approval:{is:{revocation:null}}},select:{version:true,approval:{select:{grantVersion:true}}},take:2}),
   ]);
   let published=false;
   try{if(brand){const checked=partnerBrandConfig(brand.config);published=createHash('sha256').update(canonicalLicenseJson(checked)).digest('hex')===brand.digest;}}catch{/* Malformed branding remains unready. */}
   let routes:ReturnType<typeof applicationPushRoutes>=[];
   try{routes=applicationPushRoutes(process.env);}catch{/* Never expose registry values or secrets. */}
   return {partnerId,branding:{published,version:published?brand!.version:null},
    domains:{verified:verifiedDomains,expiringSoon:expiringDomains,hasMore:false},
    licensing:{approvedActiveGrant:grants.length===1&&grants[0].approval?.grantVersion===grants[0].version,ambiguous:grants.length>1,societyOptInRevalidationRequired:true},
    applications:applications.slice(0,50).map(app=>({...app,pushRouteConfigured:routes.some(r=>r.applicationId===app.id)})),hasMoreApplications:applications.length>50,
    scopes:{pending:pendingScopes,approved:approvedScopes,licenseRevalidationRequired:true},
    externalAcceptance:{independentWorker:'ON_HOLD',physicalDevices:'ON_HOLD',productionSigning:'ON_HOLD',liveProviders:'ON_HOLD'},
    testApplicationSessionsEnabled:['test','development'].includes(process.env.NODE_ENV??'')&&process.env.AARAGATE_ENABLE_TEST_APP_SESSIONS==='true',
    dispatchAllowed:false,productionReady:false};
  });
 }
}
