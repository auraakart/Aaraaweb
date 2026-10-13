import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { PartnerDomainAction, PartnerDomainStatus, PartnerRole, Prisma } from '@prisma/client';
import { loadPartnerDomainContract } from '@aaraagate/config/partner-domain-loader';
import { PrismaService } from '../prisma/prisma.service';

const PREFIX='aaraagate-domain-verification=';
const digest=(token:string)=>createHash('sha256').update(token,'utf8').digest('hex');
const ttl=48*60*60*1000;

/** Development-only persistent DNS ownership proof. VERIFIED is cosmetic proof,
 * not host routing, license authority, society membership or partner login.
 * The verifier reads public TXT data itself; caller-supplied proof is forbidden.
 */
@Injectable()
export class PartnerDomainRegistryService {
 constructor(private readonly prisma:PrismaService){}
 private enabled() {
   if(!['test','development'].includes(process.env.NODE_ENV??'')||
       process.env.AARAGATE_ENABLE_TEST_DOMAIN_REGISTRY!=='true')
     throw new NotFoundException('Partner domain registration unavailable');
 }
 private reserved():string[] {
   let raw:unknown;
   try {
     const setting=process.env.AARAGATE_PLATFORM_HOSTNAMES??'';
     if(setting.length>4000)throw new Error('Invalid reserved hosts');
     raw=JSON.parse(setting);
   }catch{throw new NotFoundException('Platform domain configuration unavailable');}
   if(!Array.isArray(raw)||!raw.length||raw.length>50||raw.some(x=>typeof x!=='string'))
     throw new NotFoundException('Platform domain configuration unavailable');
   return raw as string[];
 }
 private async normalized(value:string) {
   try {
     const contract=await loadPartnerDomainContract();
     return contract.normalizePartnerDomainHostname(value,{reservedHostnames:this.reserved()});
   }catch{throw new BadRequestException('Invalid or reserved partner domain');}
 }
 private async scope(tx:Prisma.TransactionClient,actorId:string,partnerId:string) {
   // Serialize role changes, new registrations and revocations for one partner.
   const partner=await tx.$queryRaw<{id:string;status:string}[]>`SELECT "id","status" FROM "Partner" WHERE "id"=${partnerId}::uuid FOR UPDATE`;
   if(partner.length!==1||partner[0].status!=='ACTIVE')throw new NotFoundException('Partner resource unavailable');
   const owner=await tx.partnerMembership.findFirst({where:{partnerId,userId:actorId,active:true,role:PartnerRole.OWNER,user:{is:{status:'ACTIVE'}}},select:{id:true}});
   if(!owner)throw new NotFoundException('Partner resource unavailable');
 }
 private event(tx:Prisma.TransactionClient, domainId:string,partnerId:string,actorId:string,revision:number,action:PartnerDomainAction) {
   return tx.partnerDomainEvent.create({data:{domainId,partnerId,actorId,revision,action},select:{id:true}});
 }
 list(actorId:string,partnerId:string) {
   this.enabled();
   return this.prisma.$transaction(async tx=>{
     await this.scope(tx,actorId,partnerId);
     return tx.partnerDomainRegistration.findMany({where:{partnerId},
       select:{id:true,hostname:true,status:true,revision:true,challengeExpiresAt:true,verifiedAt:true,verifiedUntil:true,createdAt:true},
       orderBy:{createdAt:'desc'},take:50});
   });
 }
 async request(actorId:string,partnerId:string,input:{hostname:string;idempotencyKey:string}) {
   this.enabled();
   const hostname=await this.normalized(input.hostname);
   const token=randomBytes(32).toString('base64url');
   const issuedAt=new Date();
   const expiresAt=new Date(issuedAt.getTime()+ttl);
   return this.prisma.$transaction(async tx=>{
     await this.scope(tx,actorId,partnerId);
     const existing=await tx.partnerDomainRegistration.findUnique({
       where:{partnerId_idempotencyKey:{partnerId,idempotencyKey:input.idempotencyKey}},
       select:{id:true,hostname:true,status:true,requestedById:true},
     });
     if(existing){
       if(existing.hostname!==hostname||existing.requestedById!==actorId)throw new ConflictException('Domain request idempotency conflict');
       // A duplicate never re-exposes the one-time DNS proof token.
       return {id:existing.id,hostname,status:existing.status,challenge:null,existing:true,activated:false};
     }
     const occupied=await tx.partnerDomainRegistration.findUnique({where:{hostname},select:{id:true}});
     if(occupied)throw new ConflictException('Partner domain already registered');
     const domain=await tx.partnerDomainRegistration.create({data:{
       partnerId,requestedById:actorId,hostname,idempotencyKey:input.idempotencyKey,
       challengeHash:digest(token),challengeExpiresAt:expiresAt,
     },select:{id:true,status:true}});
     await this.event(tx,domain.id,partnerId,actorId,1,PartnerDomainAction.CHALLENGE_CREATED);
     return {id:domain.id,hostname,status:domain.status,challenge:{host:`_aaraagate-verify.${hostname}`,value:PREFIX+token,expiresAt},existing:false,activated:false};
   });
 }
 /** Overridable only for deterministic internal tests. Never accept a caller's DNS claim. */
 async lookupTxt(hostname:string):Promise<string[][]> {
   return resolveTxt(hostname);
 }
 private validProof(rows:string[][],expected:string):boolean {
   if(!Array.isArray(rows)||rows.length>20)return false;
   for(const parts of rows){
     if(!Array.isArray(parts)||parts.length>20||parts.some(s=>typeof s!=='string'))return false;
     const record=parts.join('');
     if(record.length>512||!record.startsWith(PREFIX))continue;
     const token=record.slice(PREFIX.length);
     if(!/^[A-Za-z0-9_-]{30,100}$/.test(token))continue;
     const actual=Buffer.from(digest(token),'hex'),reference=Buffer.from(expected,'hex');
     if(reference.length===32&&timingSafeEqual(actual,reference))return true;
   }
   return false;
 }
 async verify(actorId:string,partnerId:string,domainId:string) {
   this.enabled();
   const prior=await this.prisma.$transaction(async tx=>{
     await this.scope(tx,actorId,partnerId);
     const row=await tx.partnerDomainRegistration.findFirst({where:{id:domainId,partnerId},
       select:{id:true,hostname:true,status:true,challengeHash:true,challengeExpiresAt:true,revision:true}});
     if(!row)throw new NotFoundException('Partner domain unavailable');
     if(row.status!==PartnerDomainStatus.PENDING||row.challengeExpiresAt.getTime()<=Date.now())
       throw new ConflictException('Domain challenge unavailable');
     return row;
   });
   let records:string[][];
   try{records=await this.lookupTxt(`_aaraagate-verify.${prior.hostname}`);}catch{throw new ConflictException('Domain DNS proof unavailable');}
   if(!this.validProof(records,prior.challengeHash))throw new ConflictException('Domain DNS proof unavailable');
   return this.prisma.$transaction(async tx=>{
     await this.scope(tx,actorId,partnerId);
     await tx.$queryRaw`SELECT "id" FROM "PartnerDomainRegistration" WHERE "id"=${domainId}::uuid FOR UPDATE`;
     const row=await tx.partnerDomainRegistration.findFirst({where:{id:domainId,partnerId},
       select:{id:true,status:true,revision:true,challengeHash:true,challengeExpiresAt:true}});
     if(!row||row.status!==PartnerDomainStatus.PENDING||row.revision!==prior.revision||
         row.challengeHash!==prior.challengeHash||row.challengeExpiresAt.getTime()<=Date.now())
       throw new ConflictException('Domain challenge changed');
     const now=new Date(),verifiedUntil=new Date(now.getTime()+30*24*60*60*1000);
     const updated=await tx.partnerDomainRegistration.update({where:{id:domainId},data:{
       status:PartnerDomainStatus.VERIFIED,revision:{increment:1},verifiedAt:now,verifiedUntil,
     },select:{id:true,status:true,revision:true,verifiedUntil:true}});
     await this.event(tx,domainId,partnerId,actorId,updated.revision,PartnerDomainAction.DNS_VERIFIED);
     return {...updated,activated:false,candidateOnly:true};
   });
 }
 async revoke(actorId:string,partnerId:string,domainId:string){
   this.enabled();
   return this.prisma.$transaction(async tx=>{
     await this.scope(tx,actorId,partnerId);
     await tx.$queryRaw`SELECT "id" FROM "PartnerDomainRegistration" WHERE "id"=${domainId}::uuid FOR UPDATE`;
     const row=await tx.partnerDomainRegistration.findFirst({where:{id:domainId,partnerId},
       select:{id:true,status:true,revision:true}});
     if(!row)throw new NotFoundException('Partner domain unavailable');
     if(row.status===PartnerDomainStatus.REVOKED)return {id:row.id,status:row.status,activated:false};
     const updated=await tx.partnerDomainRegistration.update({where:{id:row.id},data:{
       status:PartnerDomainStatus.REVOKED,revision:{increment:1},revokedAt:new Date(),
     },select:{id:true,status:true,revision:true}});
     await this.event(tx,domainId,partnerId,actorId,updated.revision,PartnerDomainAction.REVOKED);
     return {id:updated.id,status:updated.status,activated:false};
   });
 }
}
