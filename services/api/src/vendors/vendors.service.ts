import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type VendorStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
type RequestStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

type ProcurementRow = {
  id: string;
  societyId: string;
  requestNumber: string;
  status: RequestStatus;
  preferredVendorId: string | null;
};

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  listVendors(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT * FROM "SocietyVendor"
      WHERE "societyId"=${societyId}::uuid
      ORDER BY CASE "status" WHEN 'ACTIVE' THEN 0 WHEN 'SUSPENDED' THEN 1 ELSE 2 END, "name" ASC
      LIMIT 500
    `);
  }

  async createVendor(societyId: string, actorUserId: string, input: {
    code: string; name: string; category: string; contactName?: string; phone?: string; email?: string; gstin?: string; notes?: string;
  }) {
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();
    const category = input.category.trim();
    if (!code || !name || !category) throw new BadRequestException('Vendor code, name and category are required');
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "SocietyVendor" ("societyId","code","name","category","contactName","phone","email","gstin","notes","createdByUserId")
      VALUES (${societyId}::uuid,${code},${name},${category},${input.contactName?.trim()||null},${input.phone?.trim()||null},${input.email?.trim()||null},${input.gstin?.trim().toUpperCase()||null},${input.notes?.trim()||null},${actorUserId}::uuid)
      RETURNING *
    `);
    return rows[0];
  }

  async updateVendorStatus(societyId: string, vendorId: string, status: VendorStatus) {
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      UPDATE "SocietyVendor" SET "status"=${status},"updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${vendorId}::uuid AND "societyId"=${societyId}::uuid
      RETURNING *
    `);
    if (!rows[0]) throw new NotFoundException('Society vendor not found');
    return rows[0];
  }

  listRequests(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT pr.*, v."name" AS "preferredVendorName"
      FROM "ProcurementRequest" pr
      LEFT JOIN "SocietyVendor" v ON v."id"=pr."preferredVendorId" AND v."societyId"=pr."societyId"
      WHERE pr."societyId"=${societyId}::uuid
      ORDER BY CASE pr."status" WHEN 'SUBMITTED' THEN 0 WHEN 'DRAFT' THEN 1 ELSE 2 END, pr."createdAt" DESC
      LIMIT 250
    `);
  }

  async createRequest(societyId: string, actorUserId: string, input: {
    requestNumber: string; title: string; description?: string; estimatedAmountPaise: number; preferredVendorId?: string; sourceType?: string; sourceId?: string;
  }) {
    if (input.estimatedAmountPaise < 0) throw new BadRequestException('Estimated amount cannot be negative');
    const requestNumber = input.requestNumber.trim().toUpperCase();
    const title = input.title.trim();
    if (!requestNumber || !title) throw new BadRequestException('Request number and title are required');
    if (input.preferredVendorId) await this.assertActiveVendor(societyId, input.preferredVendorId);

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ProcurementRow[]>(Prisma.sql`
        INSERT INTO "ProcurementRequest" ("societyId","requestNumber","title","description","estimatedAmountPaise","preferredVendorId","sourceType","sourceId","requestedByUserId")
        VALUES (${societyId}::uuid,${requestNumber},${title},${input.description?.trim()||null},${input.estimatedAmountPaise},${input.preferredVendorId??null}::uuid,${input.sourceType?.trim()||null},${input.sourceId??null}::uuid,${actorUserId}::uuid)
        RETURNING *
      `);
      const request = rows[0];
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ProcurementRequestEvent" ("societyId","requestId","actorUserId","eventType","note")
        VALUES (${societyId}::uuid,${request.id}::uuid,${actorUserId}::uuid,'CREATED','Procurement request created')
      `);
      return request;
    });
  }

  async submitRequest(societyId: string, actorUserId: string, requestId: string, note?: string) {
    return this.transition(societyId, actorUserId, requestId, 'DRAFT', 'SUBMITTED', 'SUBMITTED', note);
  }

  async approveRequest(societyId: string, actorUserId: string, requestId: string, note?: string) {
    const current = await this.findRequest(societyId, requestId);
    if (!current) throw new NotFoundException('Procurement request not found');
    if (current.preferredVendorId) await this.assertActiveVendor(societyId, current.preferredVendorId);
    return this.transition(societyId, actorUserId, requestId, 'SUBMITTED', 'APPROVED', 'APPROVED', note);
  }

  async rejectRequest(societyId: string, actorUserId: string, requestId: string, note?: string) {
    return this.transition(societyId, actorUserId, requestId, 'SUBMITTED', 'REJECTED', 'REJECTED', note);
  }

  async history(societyId: string, requestId: string) {
    if (!(await this.findRequest(societyId, requestId))) throw new NotFoundException('Procurement request not found');
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT e.*, u."name" AS "actorName" FROM "ProcurementRequestEvent" e
      JOIN "User" u ON u."id"=e."actorUserId"
      WHERE e."societyId"=${societyId}::uuid AND e."requestId"=${requestId}::uuid
      ORDER BY e."createdAt" ASC
    `);
  }

  private async transition(societyId: string, actorUserId: string, requestId: string, from: RequestStatus, to: RequestStatus, eventType: string, note?: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ProcurementRow[]>(Prisma.sql`
        UPDATE "ProcurementRequest" SET
          "status"=${to},
          "submittedAt"=CASE WHEN ${to}='SUBMITTED' THEN CURRENT_TIMESTAMP ELSE "submittedAt" END,
          "approvedByUserId"=CASE WHEN ${to}='APPROVED' THEN ${actorUserId}::uuid ELSE "approvedByUserId" END,
          "approvedAt"=CASE WHEN ${to}='APPROVED' THEN CURRENT_TIMESTAMP ELSE "approvedAt" END,
          "rejectedByUserId"=CASE WHEN ${to}='REJECTED' THEN ${actorUserId}::uuid ELSE "rejectedByUserId" END,
          "rejectedAt"=CASE WHEN ${to}='REJECTED' THEN CURRENT_TIMESTAMP ELSE "rejectedAt" END,
          "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${requestId}::uuid AND "societyId"=${societyId}::uuid AND "status"=${from}
        RETURNING *
      `);
      const updated = rows[0];
      if (!updated) throw new BadRequestException(`Procurement request must be ${from.toLowerCase()} for this action`);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ProcurementRequestEvent" ("societyId","requestId","actorUserId","eventType","note")
        VALUES (${societyId}::uuid,${requestId}::uuid,${actorUserId}::uuid,${eventType},${note?.trim()||null})
      `);
      return updated;
    });
  }

  private async findRequest(societyId: string, requestId: string) {
    const rows = await this.prisma.$queryRaw<ProcurementRow[]>(Prisma.sql`
      SELECT "id","societyId","requestNumber","status","preferredVendorId" FROM "ProcurementRequest"
      WHERE "id"=${requestId}::uuid AND "societyId"=${societyId}::uuid LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private async assertActiveVendor(societyId: string, vendorId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "SocietyVendor" WHERE "id"=${vendorId}::uuid AND "societyId"=${societyId}::uuid AND "status"='ACTIVE' LIMIT 1
    `);
    if (!rows[0]) throw new BadRequestException('Preferred vendor must be active in the current society');
  }
}
