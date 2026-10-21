import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { validateStaticPng } from '../branding/society-logo-validation';
import { PRIVATE_OBJECT_STORAGE, ObjectStoragePort } from '../services-marketplace/object-storage.port';
import { MediaSafetyScannerPort } from '../services-marketplace/media-safety-scanner.port';
import { PRIVATE_FILE_SAFETY_SCANNER } from '../storage/private-file-safety.module';

export const MAX_HELPDESK_PHOTO_BYTES = 2 * 1024 * 1024;
const photoSelect = {id:true,kind:true,note:true,sizeBytes:true,createdAt:true} as const;

@Injectable()
export class HelpdeskPhotosService {
  constructor(private readonly prisma:PrismaService,
    @Inject(PRIVATE_OBJECT_STORAGE) private readonly storage:ObjectStoragePort,
    @Inject(PRIVATE_FILE_SAFETY_SCANNER) private readonly scanner:MediaSafetyScannerPort) {}

  private async authorize(tx:Prisma.TransactionClient,societyId:string,userId:string,ticketId:string,reviewer:boolean,lock=false){
    const [ticket]=await tx.$queryRaw<Array<{id:string;status:string}>>(Prisma.sql`
      SELECT ht."id",ht."status" FROM "HelpdeskTicket" ht
      WHERE ht."societyId"=${societyId}::uuid AND ht."id"=${ticketId}::uuid
      AND (${reviewer} OR EXISTS (SELECT 1 FROM "UnitOccupancy" uo
        WHERE uo."societyId"=ht."societyId" AND uo."unitId"=ht."unitId" AND uo."userId"=${userId}::uuid
          AND uo."active"=true AND uo."effectiveFrom"<=CURRENT_TIMESTAMP AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)))
      ${lock?Prisma.sql`FOR UPDATE OF ht`:Prisma.empty}
    `);
    if(!ticket)throw new NotFoundException('Helpdesk ticket not found');
    return ticket;
  }

  list(societyId:string,userId:string,ticketId:string,reviewer=false){
    return this.prisma.withTenantContext(societyId,async tx=>{
      await this.authorize(tx,societyId,userId,ticketId,reviewer);
      return tx.helpdeskPhoto.findMany({where:{societyId,ticketId},select:photoSelect,orderBy:{createdAt:'asc'},take:6});
    });
  }

  async add(societyId:string,userId:string,ticketId:string,input:{kind:'BEFORE'|'AFTER';note?:string;idempotencyKey:string},bytes:Buffer,reviewer=false){
    if(!bytes||bytes.length>MAX_HELPDESK_PHOTO_BYTES)throw new BadRequestException('Photo must be a PNG up to 2 MiB');
    let digest:string;
    try{digest=validateStaticPng(bytes,{minDimension:1,maxDimension:1024,maxBytes:MAX_HELPDESK_PHOTO_BYTES}).sha256;}
    catch{throw new BadRequestException('Photo must be a static PNG up to 1024 pixels without embedded metadata');}
    const note=input.note?.trim()??'',key=input.idempotencyKey.trim();
    if(!['BEFORE','AFTER'].includes(input.kind)||note.length>200||key.length<8||key.length>120)throw new BadRequestException('Invalid photo details');
    const replay = (existing: {ticketId:string;sha256:string;kind:string;note:string} | null) => {
      if(existing && (existing.ticketId!==ticketId||existing.sha256!==digest||existing.kind!==input.kind||existing.note!==note))throw new ConflictException('Photo retry belongs to a different submission');
      return existing;
    };
    const prior=await this.prisma.withTenantContext(societyId,async tx=>{
      const ticket=await this.authorize(tx,societyId,userId,ticketId,reviewer);
      const existing=await tx.helpdeskPhoto.findUnique({where:{societyId_createdById_idempotencyKey:{societyId,createdById:userId,idempotencyKey:key}}});
      replay(existing);
      if(!existing && ticket.status==='CLOSED')throw new ConflictException('Reopen the complaint before adding evidence');
      if(!existing && await tx.helpdeskPhoto.count({where:{societyId,ticketId}})>=6)throw new ConflictException('A complaint can contain up to six photos');
      return existing;
    });
    if(prior)return {id:prior.id,kind:prior.kind,note:prior.note,sizeBytes:prior.sizeBytes,createdAt:prior.createdAt};
    const storageKey=`societies/${societyId}/helpdesk/${ticketId}/${randomUUID()}.png`;
    let retainObject=false,commitAttempted=false;
    try{
      const upload=await this.storage.createUploadIntent({storageKey,contentType:'image/png',contentLengthBytes:bytes.length});
      const url=new URL(upload.uploadUrl);
      if(upload.publicUrl!==null||url.protocol!=='https:'||url.username||url.password)throw new ServiceUnavailableException('Private photo storage is unavailable');
      // Signed PUT is server-only; clients receive no object key or overwrite capability.
      const result=await fetch(url,{method:'PUT',headers:upload.headers,body:new Uint8Array(bytes),redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!result.ok)throw new ServiceUnavailableException('Photo storage is unavailable');
      if((await this.scanner.scanObject({storageKey,contentType:'image/png',contentLengthBytes:bytes.length})).status!=='CLEAN')throw new BadRequestException('Photo did not pass safety scanning');
      const stored=await this.storage.getObjectBytes(storageKey,MAX_HELPDESK_PHOTO_BYTES);
      if(!stored||validateStaticPng(stored,{minDimension:1,maxDimension:1024,maxBytes:MAX_HELPDESK_PHOTO_BYTES}).sha256!==digest)throw new ConflictException('Photo changed during verification');
      commitAttempted=true;
      const photo=await this.prisma.withTenantContext(societyId,async tx=>{
        const ticket=await this.authorize(tx,societyId,userId,ticketId,reviewer,true);
        await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${societyId+':'+userId+':'+key},0))::text`);
        const existing=await tx.helpdeskPhoto.findUnique({where:{societyId_createdById_idempotencyKey:{societyId,createdById:userId,idempotencyKey:key}}});
        replay(existing);
        if(existing)return existing;
        if(ticket.status==='CLOSED')throw new ConflictException('Reopen the complaint before adding evidence');
        if(await tx.helpdeskPhoto.count({where:{societyId,ticketId}})>=6)throw new ConflictException('A complaint can contain up to six photos');
        const created=await tx.helpdeskPhoto.create({data:{societyId,ticketId,createdById:userId,idempotencyKey:key,kind:input.kind,note,storageKey,sha256:digest,sizeBytes:bytes.length}});
        await tx.$executeRaw(Prisma.sql`INSERT INTO "HelpdeskActivity" ("societyId","ticketId","actorUserId","type","message") VALUES (${societyId}::uuid,${ticketId}::uuid,${userId}::uuid,'PHOTO_ADDED',${input.kind==='BEFORE'?'Before-work photo added':'After-work photo added'})`);
        return created;
      });
      retainObject=photo.storageKey===storageKey;
      return {id:photo.id,kind:photo.kind,note:photo.note,sizeBytes:photo.sizeBytes,createdAt:photo.createdAt};
    }catch(error){
      // A lost commit acknowledgement must not cause deletion of already-linked evidence.
      if(commitAttempted){
        const linked=await this.prisma.helpdeskPhoto.findUnique({where:{storageKey}}).catch(()=>undefined);
        retainObject=linked!==null;
      }
      throw error;
    }finally{if(!retainObject)await this.storage.deleteObject(storageKey).catch(()=>undefined);}
  }

  async read(societyId:string,userId:string,ticketId:string,photoId:string,reviewer=false){
    const photo=await this.prisma.withTenantContext(societyId,async tx=>{
      await this.authorize(tx,societyId,userId,ticketId,reviewer);
      const result=await tx.helpdeskPhoto.findFirst({where:{id:photoId,societyId,ticketId}});
      if(!result)throw new NotFoundException('Complaint photo not found');
      return result;
    });
    const bytes=await this.storage.getObjectBytes(photo.storageKey,MAX_HELPDESK_PHOTO_BYTES);
    if(!bytes||validateStaticPng(bytes,{minDimension:1,maxDimension:1024,maxBytes:MAX_HELPDESK_PHOTO_BYTES}).sha256!==photo.sha256)throw new ServiceUnavailableException('Photo could not be verified');
    await this.prisma.withTenantContext(societyId,tx=>this.authorize(tx,societyId,userId,ticketId,reviewer));
    return Buffer.from(bytes);
  }
}
