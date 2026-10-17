import { Injectable, NotFoundException } from '@nestjs/common';
import { loadPartnerDomainContract } from '@aaraagate/config/partner-domain-loader';
import { AuthPrincipal, AppRole } from '../auth/auth.types';
import { EntitlementService } from './entitlement.service';
import { ProductFeature } from './entitlement.types';
import { licensePhaseAt } from './partner-license-contract';
import { canonicalLicenseJson, sameLicenseFeatures } from './partner-license-lifecycle.service';
import { SocietyOwnershipTransferService } from './society-ownership-transfer.service';

@Injectable()
export class PartnerLicenseOverviewService {
 constructor(private readonly ownership:SocietyOwnershipTransferService,private readonly entitlements:EntitlementService) {}
 private previewEnabled(){return ['test','development'].includes(process.env.NODE_ENV??'')&&process.env.AARAGATE_ENABLE_TEST_DOMAIN_PREVIEW==='true';}
 async overview(principal:AuthPrincipal,societyId:string){
  return this.ownership.withConsentAuthority(principal,societyId,async(tx,owner)=>{
   const platform=principal.roles.includes(AppRole.SUPER_ADMIN)&&Boolean(await tx.societyMembership.findFirst({where:{userId:principal.userId,societyId,role:'SUPER_ADMIN',active:true,user:{status:'ACTIVE'}},select:{id:true}}));
   const [society,partner,current,recentRows,activeRows]=await Promise.all([
    tx.society.findUniqueOrThrow({where:{id:societyId},select:{name:true,productTier:true,featureOverrides:true}}),
    tx.partner.findUniqueOrThrow({where:{id:owner.partnerId},select:{id:true,displayName:true,status:true}}),
    this.entitlements.current(societyId,tx),
    tx.partnerLicenseGrant.findMany({where:{partnerId:owner.partnerId,...(platform?{}:{OR:[{approval:{isNot:null}},{societyConsents:{some:{societyId,ownershipVersion:owner.ownershipVersion}}}]})},orderBy:{createdAt:'desc'},take:21,include:{planRevision:true,approval:{include:{revocation:true}}}}),
    tx.partnerLicenseGrant.findMany({where:{partnerId:owner.partnerId,startsAt:{lte:new Date()},endsAt:{gt:new Date()},approval:{is:{revocation:null}}},take:1,include:{planRevision:true,approval:{include:{revocation:true}}}}),
   ]);
   if(!current)throw new NotFoundException('License scope unavailable');
   const rows=[...new Map([...activeRows,...recentRows].map(g=>[g.id,g])).values()];
   const licenses=[];
   for(const g of rows.slice(0,20)){
    const c=await tx.societyLicenseConsent.findFirst({where:{societyId,grantId:g.id,ownershipVersion:owner.ownershipVersion},orderBy:{sequence:'desc'}});
    const allocation=c?await tx.societyLicenseAllocation.findUnique({where:{consentId:c.id},select:{id:true,ownershipVersion:true}}):null;
    const phase=licensePhaseAt({startsAt:g.startsAt.toISOString(),endsAt:g.endsAt.toISOString(),graceUntil:g.graceUntil?.toISOString()},new Date().toISOString());
    const approvalState=g.approval?.revocation?'REVOKED':g.approval?'APPROVED':'PENDING';
    const planFeatures=g.planRevision.featureAllowlist,known=new Set<string>(Object.values(ProductFeature));
    const compatible=Array.isArray(planFeatures)&&new Set(planFeatures).size===planFeatures.length&&planFeatures.every(f=>typeof f==='string'&&known.has(f))&&current.enabledFeatures.every(f=>planFeatures.includes(f));
    const snapshotMatches=Boolean(c&&c.grantVersion===g.version&&c.productTier===society.productTier&&canonicalLicenseJson(c.featureOverrides)===canonicalLicenseJson(society.featureOverrides)&&sameLicenseFeatures(c.enabledFeatures,current.enabledFeatures));
    const active=partner.status==='ACTIVE'&&approvalState==='APPROVED'&&g.approval?.grantVersion===g.version&&phase==='ACTIVE'&&compatible&&snapshotMatches&&c?.decision==='OPT_IN';
    const latestAllocation=allocation?{id:allocation.id,active:Boolean(active&&allocation.ownershipVersion===owner.ownershipVersion)}:null;
    let used:number|null=null;
    if(platform&&g.approval){const [capacity]=await tx.$queryRaw<{used:number}[]>`SELECT aaraagate_v5454_used(${g.approval.id}::uuid)::integer AS "used"`;used=capacity?.used??null;}
    const maker=platform&&g.createdById!==principal.userId?await tx.societyMembership.findFirst({where:{userId:g.createdById,societyId,role:'SUPER_ADMIN',active:true,user:{status:'ACTIVE'}},select:{id:true}}):null;
    const periodOpen=phase==='ACTIVE'||phase==='NOT_STARTED';
    licenses.push({grantId:g.id,grantVersion:g.version,planCode:g.planRevision.code,planVersion:g.planRevision.version,
     startsAt:g.startsAt.toISOString(),endsAt:g.endsAt.toISOString(),graceUntil:g.graceUntil?.toISOString()??null,phase,approvalState,
     maximumSocieties:g.planRevision.maximumSocieties,maximumDomains:g.planRevision.maximumDomains,used,
     consent:c?{id:c.id,decision:c.decision}:null,allocation:latestAllocation,snapshotMatches,
     capabilities:{canApprove:Boolean(platform&&maker&&partner.status==='ACTIVE'&&approvalState==='PENDING'&&compatible&&periodOpen),
      canOptIn:Boolean(partner.status==='ACTIVE'&&approvalState==='APPROVED'&&periodOpen&&compatible&&c?.decision!=='OPT_IN'),
      canWithdraw:c?.decision==='OPT_IN',canActivate:Boolean(platform&&active&&!allocation&&used!==null&&used<g.planRevision.maximumSocieties),
      canRevoke:Boolean(platform&&approvalState==='APPROVED')}});
   }
   return {society:{id:societyId,name:society.name,ownershipVersion:owner.ownershipVersion,productTier:current.productTier,enabledFeatures:current.enabledFeatures},
    partner:{id:partner.id,name:partner.displayName,status:partner.status},licenses,hasMore:rows.length>20,domainPreviewEnabled:this.previewEnabled()};
  });
 }
 async domainPreview(principal:AuthPrincipal,societyId:string,hostname:string){
  if(!this.previewEnabled())throw new NotFoundException('Test domain preview unavailable');
  const context=await this.overview(principal,societyId);
  const license=context.licenses.find(l=>l.allocation?.active&&l.maximumDomains>0);
  if(!license)throw new NotFoundException('Test domain preview unavailable');
  const raw=process.env.AARAGATE_TEST_PARTNER_DOMAINS??'[]',reservedRaw=process.env.AARAGATE_PLATFORM_HOSTNAMES??'[]';
  if(raw.length>16000||reservedRaw.length>4000)throw new NotFoundException('Test domain preview unavailable');
  let registry:unknown,reservedHostnames:unknown;
  try{registry=JSON.parse(raw);reservedHostnames=JSON.parse(reservedRaw);}catch{throw new NotFoundException('Test domain preview unavailable');}
  if(!Array.isArray(registry)||registry.length>50||!Array.isArray(reservedHostnames)||reservedHostnames.length>50||reservedHostnames.some(x=>typeof x!=='string'))throw new NotFoundException('Test domain preview unavailable');
  const contract=await loadPartnerDomainContract(),now=new Date().toISOString(),options={reservedHostnames:reservedHostnames as string[]};
  const candidate=contract.resolveVerifiedPartnerDomainHost(hostname,registry,now,options);
  if(!candidate||candidate.partnerId!==context.partner.id||candidate.brandId!==societyId)throw new NotFoundException('Test domain preview unavailable');
  const hosts=new Set(registry.flatMap(row=>{
   const match=contract.resolveVerifiedPartnerDomainHost(row?.hostname,registry,now,options);
   return match?.partnerId===context.partner.id?[match.hostname]:[];
  }));
  if(hosts.size>license.maximumDomains)throw new NotFoundException('Test domain preview unavailable');
  return {hostname:candidate.hostname,partnerId:context.partner.id,societyId,testOnly:true as const,candidateOnly:true as const,routingActivated:false as const};
 }
}
