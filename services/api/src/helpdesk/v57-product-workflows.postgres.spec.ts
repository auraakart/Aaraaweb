import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
const database=process.env.DATABASE_URL?describe:describe.skip;
database('V5.7 migration preserves historical data and evidence isolation',()=>{
 const schema=`v57_${randomUUID().replaceAll('-','')}`,url=new URL(process.env.DATABASE_URL??'postgresql://localhost/test');url.searchParams.set('schema',schema);
 const db=new PrismaClient({datasources:{db:{url:url.toString()}}});
 const sql=(input:string,target=url.toString())=>execFileSync(process.execPath,[require.resolve('prisma/build/index.js'),'db','execute','--stdin','--url',target],{input,stdio:'pipe',timeout:30000});
 const ticket=randomUUID(),society=randomUUID(),foreign=randomUUID(),booking=randomUUID();
 beforeAll(async()=>{
  sql(`CREATE SCHEMA "${schema}"`,process.env.DATABASE_URL!);
  sql(`CREATE TABLE "HelpdeskTicket" ("id" UUID PRIMARY KEY,"societyId" UUID NOT NULL);
   CREATE TABLE "HelpdeskActivity" ("type" TEXT CONSTRAINT "HelpdeskActivity_type_check" CHECK ("type" IN ('CREATED','COMMENT','INTERNAL_NOTE','STATUS_CHANGED','REOPENED','ASSIGNED')));
   CREATE TABLE "ServiceOfferingExperiencePolicy" ("offeringId" UUID PRIMARY KEY);
   CREATE TABLE "ConsumerServiceBooking" ("id" UUID PRIMARY KEY,"status" TEXT);
   INSERT INTO "ConsumerServiceBooking" VALUES ('${booking}','REQUESTED');`);
  execFileSync(process.execPath,[require.resolve('prisma/build/index.js'),'db','execute','--file',resolve('prisma/migrations/20261021140000_v57_helpdesk_photos/migration.sql'),'--url',url.toString()],{stdio:'pipe',timeout:30000});
  await db.$executeRaw`INSERT INTO "HelpdeskTicket" VALUES (${ticket}::uuid,${society}::uuid)`;
 },40000);
 afterAll(async()=>{await db.$disconnect();sql(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`,process.env.DATABASE_URL!)});
 it('leaves historical commercial terms unknown and allows normal booking transitions',async()=>{
  const [row]=await db.$queryRaw<Array<{commercialTermsSnapshot:unknown}>>`SELECT "commercialTermsSnapshot" FROM "ConsumerServiceBooking" WHERE "id"=${booking}::uuid`;
  expect(row.commercialTermsSnapshot).toBeNull();
  await db.$executeRaw`UPDATE "ConsumerServiceBooking" SET "status"='CONFIRMED' WHERE "id"=${booking}::uuid`;
  await expect(db.$executeRaw`UPDATE "ConsumerServiceBooking" SET "commercialTermsSnapshot"='{}'::jsonb WHERE "id"=${booking}::uuid`).rejects.toThrow();
 });
 it('keeps a declared snapshot immutable after catalogue terms change',async()=>{
  const id=randomUUID(),offering=randomUUID();
  await db.$executeRaw`INSERT INTO "ServiceOfferingExperiencePolicy" ("offeringId","commercialTerms") VALUES (${offering}::uuid,'{"refund":"Review required"}'::jsonb)`;
  await db.$executeRaw`INSERT INTO "ConsumerServiceBooking" ("id","status","commercialTermsSnapshot") SELECT ${id}::uuid,'REQUESTED',jsonb_build_object('terms',"commercialTerms") FROM "ServiceOfferingExperiencePolicy" WHERE "offeringId"=${offering}::uuid`;
  await db.$executeRaw`UPDATE "ServiceOfferingExperiencePolicy" SET "commercialTerms"='{"refund":"Changed later"}'::jsonb WHERE "offeringId"=${offering}::uuid`;
  const [row]=await db.$queryRaw<Array<{commercialTermsSnapshot:unknown}>>`SELECT "commercialTermsSnapshot" FROM "ConsumerServiceBooking" WHERE "id"=${id}::uuid`;
  expect(row.commercialTermsSnapshot).toEqual({terms:{refund:'Review required'}});
  await expect(db.$executeRaw`UPDATE "ConsumerServiceBooking" SET "commercialTermsSnapshot"=NULL WHERE "id"=${id}::uuid`).rejects.toThrow();
 });
 it('enforces same-society photo linkage and accepts the new activity alongside existing types',async()=>{
  const values={id:randomUUID(),societyId:society,ticketId:ticket,createdById:randomUUID(),idempotencyKey:'evidence-retry',kind:'BEFORE',note:'',storageKey:'private/a',sha256:'a'.repeat(64),sizeBytes:100};
  await db.helpdeskPhoto.create({data:values});
  await expect(db.helpdeskPhoto.create({data:{...values,id:randomUUID(),societyId:foreign,storageKey:'private/b'}})).rejects.toThrow();
  await expect(db.helpdeskPhoto.create({data:{...values,id:randomUUID(),storageKey:'private/c'}})).rejects.toThrow();
  await db.$executeRaw`INSERT INTO "HelpdeskActivity" ("type") VALUES ('PHOTO_ADDED'),('ASSIGNED'),('INTERNAL_NOTE'),('ASSET_LINKED')`;
  expect(await db.helpdeskPhoto.count()).toBe(1);
 });
});
