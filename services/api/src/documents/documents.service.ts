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
  storageKey: string;
  mimeType?: string;
  sizeBytes?: bigint;
  category?: string;
  title?: string;
  description?: string | null;
  fileName?: string;
  version?: number;
  supersedesDocumentId?: string | null;
  supersededByDocumentId?: string | null;
};

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  listManagement(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT d.*, u."number" AS "unitNumber", b."name" AS "buildingName"
      FROM "SocietyDocument" d
      LEFT JOIN "Unit" u ON u."id"=d."unitId" AND u."societyId"=d."societyId"
      LEFT JOIN "Building" b ON b."id"=u."buildingId" AND b."societyId"=d."societyId"
      WHERE d."societyId" = ${societyId}::uuid
      ORDER BY d."createdAt" DESC
    `);
  }

  managementContext(societyId: string) {
    return this.prisma.unit.findMany({
      where: { societyId },
      select: { id: true, number: true, building: { select: { id: true, name: true, code: true } } },
      orderBy: [{ buildingId: 'asc' }, { number: 'asc' }],
    });
  }

  async listPublishedForUser(societyId: string, userId: string) {
    const ownership = await this.prisma.$queryRaw<{ unitId: string }[]>(Prisma.sql`
      SELECT DISTINCT uo."unitId"
      FROM "UnitOwnership" uo
      JOIN "Unit" u ON u."id" = uo."unitId"
      WHERE uo."societyId" = ${societyId}::uuid
        AND uo."userId" = ${userId}::uuid
        AND uo."active" = true
        AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
        AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
        AND u."societyId" = ${societyId}::uuid
    `);
    const ownedUnits = ownership.map((row) => row.unitId);
    const owner = ownedUnits.length > 0;
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT * FROM "SocietyDocument"
      WHERE "societyId" = ${societyId}::uuid
        AND "status" = 'PUBLISHED'
        AND (
          "audience" = 'ALL_MEMBERS'
          OR ("audience" = 'OWNERS_ONLY' AND ${owner})
          OR ("audience" = 'PROPERTY_OWNER_ONLY' AND "unitId" IN (${Prisma.join(ownedUnits.length ? ownedUnits.map((id) => Prisma.sql`${id}::uuid`) : [Prisma.sql`NULL::uuid`])}))
        )
      ORDER BY "publishedAt" DESC NULLS LAST, "createdAt" DESC
    `);
  }

  async getManagementDocument(societyId: string, documentId: string) {
    const row = await this.findDocument(societyId, documentId);
    if (!row) throw new NotFoundException('Document not found');
    return row;
  }

  async getPublishedDocumentForUser(societyId: string, userId: string, documentId: string) {
    const rows = await this.prisma.$queryRaw<DocumentRow[]>(Prisma.sql`
      SELECT d."id", d."societyId", d."unitId", d."audience", d."status", d."storageKey", d."mimeType", d."sizeBytes"
      FROM "SocietyDocument" d
      WHERE d."id" = ${documentId}::uuid
        AND d."societyId" = ${societyId}::uuid
        AND d."status" = 'PUBLISHED'
        AND (
          d."audience" = 'ALL_MEMBERS'
          OR (d."audience" = 'OWNERS_ONLY' AND EXISTS (
            SELECT 1 FROM "UnitOwnership" uo
            WHERE uo."societyId" = ${societyId}::uuid AND uo."userId" = ${userId}::uuid
              AND uo."active" = true AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
              AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
          ))
          OR (d."audience" = 'PROPERTY_OWNER_ONLY' AND EXISTS (
            SELECT 1 FROM "UnitOwnership" uo
            WHERE uo."societyId" = ${societyId}::uuid AND uo."userId" = ${userId}::uuid
              AND uo."unitId" = d."unitId" AND uo."active" = true
              AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
              AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
          ))
        )
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) throw new NotFoundException('Published document not found');
    return row;
  }

  async createDraft(
    societyId: string,
    actorUserId: string,
    input: {
      unitId?: string; category: string; audience: DocumentAudience; title: string; description?: string;
      storageKey: string; fileName: string; mimeType: string; sizeBytes: number; version?: number;
    },
  ) {
    const title = input.title.trim();
    const storageKey = input.storageKey.trim();
    const fileName = input.fileName.trim();
    const mimeType = input.mimeType.trim().toLowerCase();
    const expectedPrefix = `societies/${societyId}/documents/`;
    if (title.length < 2 || title.length > 180) throw new BadRequestException('Document title must be between 2 and 180 characters');
    if (!storageKey.startsWith(expectedPrefix) || storageKey.length <= expectedPrefix.length || storageKey.includes('..')) {
      throw new BadRequestException('Document storage key is outside the current society scope');
    }
    if (!fileName || !mimeType) throw new BadRequestException('Document storage metadata is required');
    if (input.sizeBytes <= 0) throw new BadRequestException('Document size must be positive');
    if ((input.version ?? 1) < 1) throw new BadRequestException('Document version must be positive');
    if (input.audience === 'PROPERTY_OWNER_ONLY' && !input.unitId) throw new BadRequestException('Property-owner-only document requires unitId');
    if (input.audience !== 'PROPERTY_OWNER_ONLY' && input.unitId) throw new BadRequestException('unitId is only valid for property-owner-only documents');
    if (input.unitId) {
      const unit = await this.prisma.unit.findFirst({ where: { id: input.unitId, societyId }, select: { id: true } });
      if (!unit) throw new BadRequestException('Unit is not in current society');
    }
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        INSERT INTO "SocietyDocument" (
          "societyId", "unitId", "category", "audience", "title", "description",
          "storageKey", "fileName", "mimeType", "sizeBytes", "version", "uploadedByUserId"
        ) VALUES (
          ${societyId}::uuid, ${input.unitId ?? null}::uuid, ${input.category}, ${input.audience}, ${title}, ${input.description?.trim() || null},
          ${storageKey}, ${fileName}, ${mimeType}, ${input.sizeBytes}, ${input.version ?? 1}, ${actorUserId}::uuid
        ) RETURNING *
      `);
      const document = rows[0] as { id: string } | undefined;
      if (!document) throw new BadRequestException('Document creation failed');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "SocietyDocumentEvent" ("societyId","documentId","actorUserId","eventType","toStatus")
        VALUES (${societyId}::uuid, ${document.id}::uuid, ${actorUserId}::uuid, 'CREATED', 'DRAFT')
      `);
      return rows[0];
    });
  }

  async createReplacementDraft(
    societyId: string,
    actorUserId: string,
    documentId: string,
    input: { storageKey: string; fileName: string; mimeType: string; sizeBytes: number; description?: string },
  ) {
    const storageKey = input.storageKey.trim();
    const fileName = input.fileName.trim();
    const mimeType = input.mimeType.trim().toLowerCase();
    const expectedPrefix = `societies/${societyId}/documents/`;
    if (!storageKey.startsWith(expectedPrefix) || storageKey.length <= expectedPrefix.length || storageKey.includes('..')) {
      throw new BadRequestException('Document storage key is outside the current society scope');
    }
    if (!fileName || !mimeType || input.sizeBytes <= 0) throw new BadRequestException('Replacement document storage metadata is required');

    return this.prisma.$transaction(async (tx) => {
      const currentRows = await tx.$queryRaw<DocumentRow[]>(Prisma.sql`
        SELECT "id","societyId","unitId","audience","status","storageKey","mimeType","sizeBytes","category","title","description","fileName","version",
               "supersedesDocumentId","supersededByDocumentId"
        FROM "SocietyDocument"
        WHERE "id"=${documentId}::uuid AND "societyId"=${societyId}::uuid
        FOR UPDATE
      `);
      const current = currentRows[0];
      if (!current) throw new NotFoundException('Document not found');
      if (current.status !== 'PUBLISHED') throw new BadRequestException('Only a published document can be superseded');
      if (current.supersededByDocumentId) throw new BadRequestException('Document has already been superseded');

      const existingReplacement = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "SocietyDocument"
        WHERE "societyId"=${societyId}::uuid AND "supersedesDocumentId"=${documentId}::uuid AND "status" <> 'ARCHIVED'
        LIMIT 1
      `);
      if (existingReplacement[0]) throw new BadRequestException('A replacement version already exists for this document');

      const rows = await tx.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        INSERT INTO "SocietyDocument" (
          "societyId","unitId","category","audience","title","description",
          "storageKey","fileName","mimeType","sizeBytes","version","uploadedByUserId","supersedesDocumentId"
        ) VALUES (
          ${societyId}::uuid,${current.unitId}::uuid,${current.category ?? 'OTHER'},${current.audience},
          ${current.title ?? 'Document'},${input.description?.trim() || current.description || null},
          ${storageKey},${fileName},${mimeType},${input.sizeBytes},${(current.version ?? 1) + 1},${actorUserId}::uuid,${current.id}::uuid
        )
        RETURNING *
      `);
      const replacement = rows[0] as { id: string } | undefined;
      if (!replacement) throw new BadRequestException('Replacement document creation failed');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "SocietyDocumentEvent" ("societyId","documentId","actorUserId","eventType","toStatus","note")
        VALUES (${societyId}::uuid,${replacement.id}::uuid,${actorUserId}::uuid,'CREATED','DRAFT',${`Replacement draft for document ${current.id}`})
      `);
      return rows[0];
    });
  }

  async publish(societyId: string, actorUserId: string, documentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<DocumentRow[]>(Prisma.sql`
        SELECT "id","societyId","unitId","audience","status","storageKey","mimeType","sizeBytes","category","title","description","fileName","version",
               "supersedesDocumentId","supersededByDocumentId"
        FROM "SocietyDocument"
        WHERE "id"=${documentId}::uuid AND "societyId"=${societyId}::uuid
        FOR UPDATE
      `);
      const current = rows[0];
      if (!current) throw new NotFoundException('Document not found');
      if (current.status !== 'DRAFT') throw new BadRequestException('Document changed or is not in required status');

      if (!current.supersedesDocumentId) {
        const published = await tx.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
          UPDATE "SocietyDocument"
          SET "status"='PUBLISHED',"publishedByUserId"=${actorUserId}::uuid,"publishedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
          WHERE "id"=${documentId}::uuid AND "societyId"=${societyId}::uuid AND "status"='DRAFT'
          RETURNING *
        `);
        if (!published[0]) throw new BadRequestException('Document changed or is not in required status');
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "SocietyDocumentEvent" ("societyId","documentId","actorUserId","eventType","fromStatus","toStatus")
          VALUES (${societyId}::uuid,${documentId}::uuid,${actorUserId}::uuid,'PUBLISHED','DRAFT','PUBLISHED')
        `);
        return published[0];
      }

      const priorRows = await tx.$queryRaw<DocumentRow[]>(Prisma.sql`
        SELECT "id","societyId","status","version","supersededByDocumentId"
        FROM "SocietyDocument"
        WHERE "id"=${current.supersedesDocumentId}::uuid AND "societyId"=${societyId}::uuid
        FOR UPDATE
      `);
      const prior = priorRows[0];
      if (!prior || prior.status !== 'PUBLISHED') throw new BadRequestException('Superseded document is no longer published');
      if (prior.supersededByDocumentId) throw new BadRequestException('Superseded document already has a replacement');

      const published = await tx.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        UPDATE "SocietyDocument"
        SET "status"='PUBLISHED',"publishedByUserId"=${actorUserId}::uuid,"publishedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${documentId}::uuid AND "societyId"=${societyId}::uuid AND "status"='DRAFT'
        RETURNING *
      `);
      if (!published[0]) throw new BadRequestException('Replacement document changed before publication');

      const archived = await tx.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        UPDATE "SocietyDocument"
        SET "status"='ARCHIVED',"archivedAt"=CURRENT_TIMESTAMP,"supersededByDocumentId"=${documentId}::uuid,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${prior.id}::uuid AND "societyId"=${societyId}::uuid AND "status"='PUBLISHED' AND "supersededByDocumentId" IS NULL
        RETURNING *
      `);
      if (!archived[0]) throw new BadRequestException('Superseded document changed before replacement publication');

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "SocietyDocumentEvent" ("societyId","documentId","actorUserId","eventType","fromStatus","toStatus","note")
        VALUES
          (${societyId}::uuid,${documentId}::uuid,${actorUserId}::uuid,'PUBLISHED','DRAFT','PUBLISHED',${`Supersedes document ${prior.id}`}),
          (${societyId}::uuid,${prior.id}::uuid,${actorUserId}::uuid,'VERSION_REPLACED','PUBLISHED','ARCHIVED',${`Replaced by document ${documentId}`})
      `);
      return published[0];
    });
  }

  async archive(societyId: string, actorUserId: string, documentId: string) {
    const current = await this.findDocument(societyId, documentId);
    if (!current) throw new NotFoundException('Document not found');
    if (current.status === 'ARCHIVED') return current;
    return this.transition(societyId, actorUserId, documentId, current.status, 'ARCHIVED', 'ARCHIVED');
  }

  async history(societyId: string, documentId: string) {
    const current = await this.findDocument(societyId, documentId);
    if (!current) throw new NotFoundException('Document not found');
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT e.*, u."name" AS "actorName" FROM "SocietyDocumentEvent" e
      JOIN "User" u ON u."id" = e."actorUserId"
      WHERE e."societyId" = ${societyId}::uuid AND e."documentId" = ${documentId}::uuid
      ORDER BY e."createdAt" ASC
    `);
  }

  private async transition(societyId: string, actorUserId: string, documentId: string, fromStatus: DocumentStatus, toStatus: DocumentStatus, eventType: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        UPDATE "SocietyDocument" SET "status" = ${toStatus},
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
      SELECT "id","societyId","unitId","audience","status","storageKey","mimeType","sizeBytes","category","title","description","fileName","version",
             "supersedesDocumentId","supersededByDocumentId" FROM "SocietyDocument"
      WHERE "id" = ${documentId}::uuid AND "societyId" = ${societyId}::uuid LIMIT 1
    `);
    return rows[0] ?? null;
  }
}
