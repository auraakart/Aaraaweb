import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type TaxConfigurationInput={gstEnabled:boolean;gstin?:string;tdsEnabled:boolean;tan?:string;defaultTdsSection?:string;defaultTdsBasisPoints?:number};
type TaxMetadataInput={documentType:'EXPENSE'|'CHARGE_RULE'|'RECEIVABLE';documentId:string;taxableAmountPaise?:number;gstRateBasisPoints?:number;gstAmountPaise?:number;vendorGstin?:string;invoiceNumber?:string;tdsSection?:string;tdsRateBasisPoints?:number;tdsAmountPaise?:number;metadata?:Record<string,unknown>};

@Injectable()
export class FinanceTaxService{
  constructor(private readonly prisma:PrismaService){}

  async configuration(societyId:string){
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`SELECT "societyId","gstEnabled","gstin","tdsEnabled","tan","defaultTdsSection","defaultTdsBasisPoints","updatedAt" FROM "SocietyTaxConfiguration" WHERE "societyId"=${societyId}::uuid LIMIT 1`);
    return rows[0]??{societyId,gstEnabled:false,gstin:null,tdsEnabled:false,tan:null,defaultTdsSection:null,defaultTdsBasisPoints:null};
  }

  async updateConfiguration(societyId:string,userId:string,input:TaxConfigurationInput){
    if(input.gstEnabled&&!input.gstin?.trim())throw new BadRequestException('GSTIN is required when GST support is enabled');
    if(input.tdsEnabled&&input.defaultTdsBasisPoints!==undefined&&(input.defaultTdsBasisPoints<0||input.defaultTdsBasisPoints>10000))throw new BadRequestException('Default TDS rate must be between 0 and 10000 basis points');
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      INSERT INTO "SocietyTaxConfiguration" ("societyId","gstEnabled","gstin","tdsEnabled","tan","defaultTdsSection","defaultTdsBasisPoints","updatedByUserId")
      VALUES (${societyId}::uuid,${input.gstEnabled},${input.gstEnabled?input.gstin?.trim().toUpperCase():null},${input.tdsEnabled},${input.tdsEnabled?input.tan?.trim().toUpperCase()||null:null},${input.tdsEnabled?input.defaultTdsSection?.trim().toUpperCase()||null:null},${input.tdsEnabled?input.defaultTdsBasisPoints??null:null},${userId}::uuid)
      ON CONFLICT ("societyId") DO UPDATE SET "gstEnabled"=EXCLUDED."gstEnabled","gstin"=EXCLUDED."gstin","tdsEnabled"=EXCLUDED."tdsEnabled","tan"=EXCLUDED."tan","defaultTdsSection"=EXCLUDED."defaultTdsSection","defaultTdsBasisPoints"=EXCLUDED."defaultTdsBasisPoints","updatedByUserId"=EXCLUDED."updatedByUserId","updatedAt"=CURRENT_TIMESTAMP
      RETURNING "societyId","gstEnabled","gstin","tdsEnabled","tan","defaultTdsSection","defaultTdsBasisPoints","updatedAt"
    `);return rows[0];
  }

  listMetadata(societyId:string,documentType?:string){return this.prisma.$queryRaw(Prisma.sql`
    SELECT "id","documentType","documentId","taxableAmountPaise"::text AS "taxableAmountPaise","gstRateBasisPoints","gstAmountPaise"::text AS "gstAmountPaise","vendorGstin","invoiceNumber","tdsSection","tdsRateBasisPoints","tdsAmountPaise"::text AS "tdsAmountPaise","metadata","updatedAt"
    FROM "FinanceTaxDocumentMetadata" WHERE "societyId"=${societyId}::uuid AND (${documentType??null}::text IS NULL OR "documentType"=${documentType??null}) ORDER BY "updatedAt" DESC LIMIT 500
  `);}

  async upsertMetadata(societyId:string,userId:string,input:TaxMetadataInput){
    const config=await this.configuration(societyId) as {gstEnabled?:boolean;tdsEnabled?:boolean};
    const hasGst=input.gstRateBasisPoints!==undefined||input.gstAmountPaise!==undefined||Boolean(input.vendorGstin);
    const hasTds=input.tdsRateBasisPoints!==undefined||input.tdsAmountPaise!==undefined||Boolean(input.tdsSection);
    if(hasGst&&!config.gstEnabled)throw new BadRequestException('GST metadata cannot be recorded until GST support is enabled for the society');
    if(hasTds&&!config.tdsEnabled)throw new BadRequestException('TDS metadata cannot be recorded until TDS support is enabled for the society');
    for(const rate of [input.gstRateBasisPoints,input.tdsRateBasisPoints])if(rate!==undefined&&(rate<0||rate>10000))throw new BadRequestException('Tax rate must be between 0 and 10000 basis points');
    for(const amount of [input.taxableAmountPaise,input.gstAmountPaise,input.tdsAmountPaise])if(amount!==undefined&&amount<0)throw new BadRequestException('Tax amounts cannot be negative');
    await this.assertDocument(societyId,input.documentType,input.documentId);
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      INSERT INTO "FinanceTaxDocumentMetadata" ("societyId","documentType","documentId","taxableAmountPaise","gstRateBasisPoints","gstAmountPaise","vendorGstin","invoiceNumber","tdsSection","tdsRateBasisPoints","tdsAmountPaise","metadata","updatedByUserId")
      VALUES (${societyId}::uuid,${input.documentType},${input.documentId}::uuid,${input.taxableAmountPaise??null},${input.gstRateBasisPoints??null},${input.gstAmountPaise??null},${input.vendorGstin?.trim().toUpperCase()||null},${input.invoiceNumber?.trim()||null},${input.tdsSection?.trim().toUpperCase()||null},${input.tdsRateBasisPoints??null},${input.tdsAmountPaise??null},${JSON.stringify(input.metadata??{})}::jsonb,${userId}::uuid)
      ON CONFLICT ("societyId","documentType","documentId") DO UPDATE SET "taxableAmountPaise"=EXCLUDED."taxableAmountPaise","gstRateBasisPoints"=EXCLUDED."gstRateBasisPoints","gstAmountPaise"=EXCLUDED."gstAmountPaise","vendorGstin"=EXCLUDED."vendorGstin","invoiceNumber"=EXCLUDED."invoiceNumber","tdsSection"=EXCLUDED."tdsSection","tdsRateBasisPoints"=EXCLUDED."tdsRateBasisPoints","tdsAmountPaise"=EXCLUDED."tdsAmountPaise","metadata"=EXCLUDED."metadata","updatedByUserId"=EXCLUDED."updatedByUserId","updatedAt"=CURRENT_TIMESTAMP
      RETURNING "id","documentType","documentId","taxableAmountPaise"::text AS "taxableAmountPaise","gstRateBasisPoints","gstAmountPaise"::text AS "gstAmountPaise","vendorGstin","invoiceNumber","tdsSection","tdsRateBasisPoints","tdsAmountPaise"::text AS "tdsAmountPaise","metadata","updatedAt"
    `);return rows[0];
  }

  private async assertDocument(societyId:string,type:TaxMetadataInput['documentType'],id:string){
    let rows:Array<{id:string}>;
    if(type==='EXPENSE') rows=await this.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "SocietyExpense" WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid LIMIT 1`);
    else if(type==='CHARGE_RULE') rows=await this.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "ChargeRule" WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid LIMIT 1`);
    else rows=await this.prisma.$queryRaw(Prisma.sql`SELECT "id" FROM "Receivable" WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid LIMIT 1`);
    if(!rows.length)throw new NotFoundException('Finance document was not found in the current society');
  }
}
