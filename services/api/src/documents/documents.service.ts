import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
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
      SELECT d.*, EXISTS (
        SELECT 1 FROM "SocietyDocumentKnowledge" k
        WHERE k."documentId"=d."id" AND k."societyId"=d."societyId"
      ) AS "knowledgeAvailable", u."number" AS "unitNumber", b."name" AS "buildingName"
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
      SELECT d.*, u."number" AS "unitNumber", b."name" AS "buildingName"
      FROM "SocietyDocument" d
      LEFT JOIN "Unit" u ON u."id"=d."unitId" AND u."societyId"=d."societyId"
      LEFT JOIN "Building" b ON b."id"=u."buildingId" AND b."societyId"=d."societyId"
      WHERE d."societyId" = ${societyId}::uuid
        AND d."status" = 'PUBLISHED'
        AND (
          d."audience" = 'ALL_MEMBERS'
          OR (d."audience" = 'OWNERS_ONLY' AND ${owner})
          OR (d."audience" = 'PROPERTY_OWNER_ONLY' AND d."unitId" IN (${Prisma.join(ownedUnits.length ? ownedUnits.map((id) => Prisma.sql`${id}::uuid`) : [Prisma.sql`NULL::uuid`])}))
        )
      ORDER BY d."publishedAt" DESC NULLS LAST, d."createdAt" DESC
    `);
  }

  async searchKnowledgeForUser(societyId: string, userId: string, query: string, includeManagement = false) {
    const normalized = query.toLowerCase().replace(/[^a-z0-9\u0900-\u097f\u0980-\u09ff\u0b80-\u0bff\u0c00-\u0c7f\u0c80-\u0cff\u0d00-\u0d7f ]/gu, ' ');
    const rawTokens = [...new Set(normalized.split(/\s+/).map(token => token.trim()).filter(token => token.length >= 3))].slice(0, 8);
    const genericTerms = new Set([
      'society','community','document','documents','policy','policies','rule','rules','bylaw','bylaws','handbook','circular',
      'please','show','tell','what','where','when','which','about','does','have','with','from','this','that','your','there','need','know',
    ]);
    const distinctiveTokens = rawTokens.filter(token => !genericTerms.has(token));
    const tokens = distinctiveTokens.length > 0 ? distinctiveTokens : rawTokens;
    if (tokens.length === 0) return [];
    const matchClauses = tokens.map(token => {
      const like = `%${token}%`;
      return Prisma.sql`(
        LOWER(d."title") LIKE ${like}
        OR LOWER(COALESCE(d."description",'')) LIKE ${like}
        OR LOWER(COALESCE(k."contentText",'')) LIKE ${like}
      )`;
    });
    const rows = await this.prisma.$queryRaw<Array<{
      id:string; title:string; description:string|null; category:string; version:number;
      publishedAt:Date|null; contentText:string|null; contentHash:string|null;
    }>>(Prisma.sql`
      SELECT d."id",d."title",d."description",d."category",d."version",d."publishedAt",
             k."contentText",k."contentHash"
      FROM "SocietyDocument" d
      LEFT JOIN "SocietyDocumentKnowledge" k
        ON k."documentId"=d."id" AND k."societyId"=d."societyId"
      WHERE d."societyId"=${societyId}::uuid
        AND d."status"='PUBLISHED'
        AND (
          ${includeManagement}
          OR d."audience"='ALL_MEMBERS'
          OR (d."audience"='OWNERS_ONLY' AND EXISTS (
            SELECT 1 FROM "UnitOwnership" uo
            WHERE uo."societyId"=${societyId}::uuid AND uo."userId"=${userId}::uuid
              AND uo."active"=true AND uo."effectiveFrom"<=CURRENT_TIMESTAMP
              AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
          ))
          OR (d."audience"='PROPERTY_OWNER_ONLY' AND EXISTS (
            SELECT 1 FROM "UnitOwnership" uo
            WHERE uo."societyId"=${societyId}::uuid AND uo."userId"=${userId}::uuid
              AND uo."unitId"=d."unitId" AND uo."active"=true
              AND uo."effectiveFrom"<=CURRENT_TIMESTAMP
              AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
          ))
        )
        AND (${Prisma.join(matchClauses,' OR ')})
      ORDER BY d."publishedAt" DESC NULLS LAST,d."createdAt" DESC
      LIMIT 40
    `);
    const phrase = tokens.join(' ');
    const minimumMatchedTerms = tokens.length >= 4 ? 2 : 1;
    return rows.map(row => {
      const title = row.title.toLowerCase();
      const description = (row.description ?? '').toLowerCase();
      const content = (row.contentText ?? '').toLowerCase();
      const matchedTerms = tokens.filter(token => title.includes(token) || description.includes(token) || content.includes(token));
      const coveragePercent = Math.round((matchedTerms.length / tokens.length) * 100);
      const score = (phrase.length >= 5 && (title.includes(phrase) || description.includes(phrase) || content.includes(phrase)) ? 8 : 0)
        + tokens.reduce((sum,token)=>sum+(title.includes(token)?4:0)+(description.includes(token)?2:0)+(content.includes(token)?1:0),0);
      const sourceText = row.contentText?.trim() || row.description?.trim() || row.title;
      const first = matchedTerms.map(token=>sourceText.toLowerCase().indexOf(token)).filter(index=>index>=0).sort((a,b)=>a-b)[0] ?? 0;
      const start = Math.max(0, first - 90);
      const excerpt = sourceText.slice(start, start + 420).trim();
      return {
        documentId:row.id,title:row.title,category:row.category,version:row.version,
        publishedAt:row.publishedAt,excerpt,contentHash:row.contentHash,score,
        matchedTerms,queryTermCount:tokens.length,coveragePercent,
      };
    }).filter(item=>item.matchedTerms.length>=minimumMatchedTerms)
      .sort((a,b)=>b.coveragePercent-a.coveragePercent || b.score-a.score || String(b.publishedAt??'').localeCompare(String(a.publishedAt??'')))
      .slice(0,5);
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
      unitId?: string; category: string; audience: DocumentAudience; title: string; description?: string; knowledgeText?: string;
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
    const knowledgeText = this.normalizeKnowledgeText(input.knowledgeText);
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
      if (knowledgeText) {
        const knowledgeHash = createHash('sha256').update(knowledgeText).digest('hex');
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "SocietyDocumentKnowledge" ("societyId","documentId","contentText","contentHash","indexedByUserId")
          VALUES (${societyId}::uuid,${document.id}::uuid,${knowledgeText},${knowledgeHash},${actorUserId}::uuid)
        `);
      }
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "SocietyDocumentEvent" ("societyId","documentId","actorUserId","eventType","toStatus","note")
        VALUES (${societyId}::uuid, ${document.id}::uuid, ${actorUserId}::uuid, 'CREATED', 'DRAFT',
          ${knowledgeText ? 'Human-reviewed knowledge text attached to this version.' : null})
      `);
      return rows[0];
    });
  }

  async createReplacementDraft(
    societyId: string,
    actorUserId: string,
    documentId: string,
    input: { storageKey: string; fileName: string; mimeType: string; sizeBytes: number; description?: string; knowledgeText?: string },
  ) {
    const storageKey = input.storageKey.trim();
    const fileName = input.fileName.trim();
    const mimeType = input.mimeType.trim().toLowerCase();
    const expectedPrefix = `societies/${societyId}/documents/`;
    if (!storageKey.startsWith(expectedPrefix) || storageKey.length <= expectedPrefix.length || storageKey.includes('..')) {
      throw new BadRequestException('Document storage key is outside the current society scope');
    }
    if (!fileName || !mimeType || input.sizeBytes <= 0) throw new BadRequestException('Replacement document storage metadata is required');
    const knowledgeText = this.normalizeKnowledgeText(input.knowledgeText);

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
      if (knowledgeText) {
        const knowledgeHash = createHash('sha256').update(knowledgeText).digest('hex');
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "SocietyDocumentKnowledge" ("societyId","documentId","contentText","contentHash","indexedByUserId")
          VALUES (${societyId}::uuid,${replacement.id}::uuid,${knowledgeText},${knowledgeHash},${actorUserId}::uuid)
        `);
      }
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "SocietyDocumentEvent" ("societyId","documentId","actorUserId","eventType","toStatus","note")
        VALUES (${societyId}::uuid,${replacement.id}::uuid,${actorUserId}::uuid,'CREATED','DRAFT',
          ${knowledgeText ? `Replacement draft for document ${current.id}; reviewed knowledge text attached.` : `Replacement draft for document ${current.id}`})
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

  private normalizeKnowledgeText(value?: string) {
    const normalized = value?.replace(/\r\n?/g,'\n').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim() ?? '';
    if (!normalized) return '';
    if (normalized.length < 20) throw new BadRequestException('Knowledge text must contain at least 20 characters when provided');
    if (normalized.length > 12000) throw new BadRequestException('Knowledge text must not exceed 12000 characters');
    return normalized;
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
