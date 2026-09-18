import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ContractStatus='ACTIVE'|'EXPIRED'|'TERMINATED';

@Injectable()
export class VendorContractsService {
  constructor(private readonly prisma: PrismaService) {}

  listContracts(societyId:string){
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT c.*,v."code" AS "vendorCode",v."name" AS "vendorName",
        CASE
          WHEN c."status"='TERMINATED' THEN 'TERMINATED'
          WHEN c."status"='EXPIRED' OR c."endsOn"<CURRENT_DATE THEN 'EXPIRED'
          WHEN c."endsOn"<=CURRENT_DATE+(c."renewalNoticeDays"*INTERVAL '1 day') THEN 'EXPIRING_SOON'
          ELSE 'CURRENT'
        END AS "lifecycleState"
      FROM "SocietyVendorContract" c
      JOIN "SocietyVendor" v ON v."id"=c."vendorId" AND v."societyId"=c."societyId"
      WHERE c."societyId"=${societyId}::uuid
      ORDER BY CASE WHEN c."status"='ACTIVE' THEN 0 ELSE 1 END,c."endsOn" ASC,c."createdAt" DESC
      LIMIT 500
    `);
  }

  async createContract(societyId:string,actorUserId:string,input:{
    vendorId:string;contractNumber:string;title:string;contractType:'AMC'|'SERVICE_AGREEMENT'|'SUPPLY'|'OTHER';
    startsOn:string;endsOn:string;renewalNoticeDays:number;slaReference?:string;documentReference?:string;notes?:string;
  }){
    const number=input.contractNumber.trim().toUpperCase(),title=input.title.trim();
    if(!number||!title)throw new BadRequestException('Contract number and title are required');
    if(input.endsOn<input.startsOn)throw new BadRequestException('Contract end date cannot be before start date');
    const [vendor]=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`
      SELECT "id" FROM "SocietyVendor" WHERE "id"=${input.vendorId}::uuid AND "societyId"=${societyId}::uuid AND "status"='ACTIVE' LIMIT 1
    `);
    if(!vendor)throw new BadRequestException('Contract vendor must be active in the current society');
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        INSERT INTO "SocietyVendorContract" ("societyId","vendorId","contractNumber","title","contractType","startsOn","endsOn","renewalNoticeDays","slaReference","documentReference","notes","createdByUserId")
        VALUES (${societyId}::uuid,${input.vendorId}::uuid,${number},${title},${input.contractType},${input.startsOn}::date,${input.endsOn}::date,${input.renewalNoticeDays},${input.slaReference?.trim()||null},${input.documentReference?.trim()||null},${input.notes?.trim()||null},${actorUserId}::uuid)
        RETURNING *
      `);
      const contract=rows[0] as {id:string};
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "SocietyVendorContractEvent" ("societyId","contractId","actorUserId","eventType","note")
        VALUES (${societyId}::uuid,${contract.id}::uuid,${actorUserId}::uuid,'CREATED','Vendor contract created')
      `);
      return contract;
    });
  }

  async updateStatus(societyId:string,actorUserId:string,contractId:string,status:ContractStatus,note?:string){
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        UPDATE "SocietyVendorContract" SET "status"=${status},"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${contractId}::uuid AND "societyId"=${societyId}::uuid
        RETURNING *
      `);
      const contract=rows[0] as {id:string}|undefined;
      if(!contract)throw new NotFoundException('Society vendor contract not found');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "SocietyVendorContractEvent" ("societyId","contractId","actorUserId","eventType","note","metadataJson")
        VALUES (${societyId}::uuid,${contractId}::uuid,${actorUserId}::uuid,'STATUS_UPDATED',${note?.trim()||null},jsonb_build_object('status',${status}))
      `);
      return contract;
    });
  }
}
