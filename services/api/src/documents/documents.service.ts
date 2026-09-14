import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type DocumentAudience = 'MANAGEMENT' | 'ALL_MEMBERS' | 'OWNERS_ONLY' | 'PROPERTY_OWNER_ONLY';
type DocumentStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

type DocumentRow = {
  id: string;
  societyId: string;
  unitId: string | null;
  audience: DocumentAudience;
  status: DocumentStatus;
};

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  listManagement(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT * FROM "SocietyDocument"
      WHERE "societyId" = ${societyId}::uuid
      ORDER BY "createdAt" DESC
    `);
  }

  async listPublishedForUser(societyId: string, userId: string) {
    const ownership = await this.prisma.$queryRaw<{ unitId: string }[]>(Prisma.sql`
      SELECT DISTINCT po."unitId"
      FROM "PropertyOwnership" po
      JOIN "Unit" u ON u."id" = po."unitId"
      WHERE po."societyId" = ${societyId}::uuid
        AND po."userId" = ${userId}::uuid
        AND po."active" = true
        AND u."societyId" = ${societyId}::uuid
    `);
    const ownedUnits = ownership.map((row) => row.unitId);

    return this.prisma.$queryRaw(Prisma.sql`
      SELECT * FROM "SocietyDocument"
      WHERE "societyId" = ${societyId}::uuid
        AND "status" = 'PUBLISHED'
        AND (
          "audience" = 'ALL_MEMBERS'
          OR ("audience" = 'OWNERS_ONLY' AND ${ownedUnits.length > 0})
          OR ("audience" = 'PROPERTY_OWNER_ONLY' AND "unitId" IN (${Prisma.join(ownedUnits.length ? ownedUnits.map((id) => Prisma.sql`${id}::uuid`) : [Prisma.sql`NULL::uuid`])}))
        )
      ORDER BY "publishedAt" DESC NULLS LAST, "createdAt" DESC
    `);
  }

  async createDraft(
    societyId: string,
    actorUserId: string,
    input: {
      unitId?: string;
      category: string;
      audience: DocumentAudience;
      title: string;
      description?: string;
      storageKey: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      version?: number;
    },
  ) {
    const title = input.title.trim();
    if (title.length < 2 || title.length > 180) throw new BadRequestException('Document title must be between 2 and 180 characters');
    if (input.sizeBytes < 0) throw new BadRequestException('Document size must be non-negative');
    if (input.audience === 'PROPERTY_OWNER_ONLY' && !input.unitId) throw new BadRequestException('Property-owner-only document requires unitId');
    if (input.audience !== 'PROPERTY_OWNER_ONLY' && input.unitId) throw new BadRequestException('unitId is only valid for property-owner-only documents');

    if (input.unitId) {
      const unit = await this.prisma.unit.findFirst({ where: { id: input.unitId, societyId }, select: { id: true } });
      if (!unit) throw new BadRequestException('Unit is not in current society');
    }

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<any[]>(Prisma.sql`
        INSERT INTO "SocietyDocument" (
          "societyId", "unitId", "category", "audience", "title", "description",
          "storageKey", "fileName", "mimeType", "sizeBytes", "version", "uploadedByUserId"
        ) VALUES (
          ${societyId}::uuid, ${input.unitId ?? null}::uuid, ${input.category}, ${input.audience}, ${title}, ${input.description?.trim() || null},
          ${input.storageKey.trim()}, ${input.fileName.trim()}, ${input.mimeType.trim()}, ${input.sizeBytes}, ${input.version ?? 1}, ${actorUserId}::uuid
        ) RETURNING *
      `);
      const document = rows[0];
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "SocietyDocumentEvent" ("societyId","documentId","actorUserId","eventType","toStatus")
        VALUES (${societyId}::uuid, ${document.id}::uuid, ${actorUserId}::uuid, 'CREATED', 'DRAFT')
      `);
      return document;
    });
  }

  async publish(societyId: string, actorUserId: string, documentId: string) {
    return this.transition(societyId, actorUserId, documentId, 'DRAFT', 'PUBLISHED', 'PUBLISHED');
  }

  async archive(societyId: string, actorUserId: string, documentId: string) {
    const current = await this.findDocument(societyId, documentId);
    if (!current) throw new NotFoundException('Document not found');
    if (current.status === 'ARCHIVED') return current;
    if (current.status !== 'DRAFT' && current.status !== 'PUBLISHED') throw new BadRequestException('Document cannot be archived');
    return this.transition(societyId, actorUserId, documentId, current.status, 'ARCHIVED', 'ARCHIVED');
  }

  history(societyId: string, documentId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT e.*, u."name" AS "actorName"
      FROM "SocietyDocumentEvent" e
      JOIN "User" u ON u."id" = e."actorUserId"
      WHERE e."societyId" = ${societyId}::uuid AND e."documentId" = ${documentId}::uuid
      ORDER BY e."createdAt" ASC
    `);
  }

  private async transition(societyId: string, actorUserId: string, documentId: string, fromStatus: DocumentStatus, toStatus: DocumentStatus, eventType: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<any[]>(Prisma.sql`
        UPDATE "SocietyDocument"
        SET "status" = ${toStatus},
            "publishedByUserId" = CASE WHEN ${toStatus} = 'PUBLISHED' THEN ${actorUserId}::uuid ELSE "publishedByUserId" END,
            "publishedAt" = CASE WHEN ${toStatus} = 'PUBLISHED' THEN CURRENT_TIMESTAMP ELSE "publishedAt" END,
            "archivedAt" = CASE WHEN ${toStatus} = 'ARCHIVED' THEN CURRENT_TIMESTAMP ELSE "archivedAt" END,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${documentId}::uuid AND "societyId" = ${societyId}::uuid AND "status" = ${fromStatus}
        RETURNING *
      `);
      const updated = rows[0];
      if (!updated) throw new BadRequestException('Document changed or is not in required status');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "SocietyDocumentEvent" ("societyId","documentId","actorUserId","eventType","fromStatus","toStatus")
        VALUES (${societyId}::uuid, ${documentId}::uuid, ${actorUserId}::uuid, ${eventType}, ${fromStatus}, ${toStatus})
      `);
      return updated;
    });
  }

  private async findDocument(societyId: string, documentId: string) {
    const rows = await this.prisma.$queryRaw<DocumentRow[]>(Prisma.sql`
      SELECT "id","societyId","unitId","audience","status" FROM "SocietyDocument"
      WHERE "id" = ${documentId}::uuid AND "societyId" = ${societyId}::uuid LIMIT 1
    `);
    return rows[0] ?? null;
  }
}
