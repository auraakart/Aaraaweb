import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type DataCategoryInput = {
  code: string;
  name: string;
  purpose: string;
  legalBasis?: string;
  retentionTrigger: string;
  retentionDays?: number;
  containsSensitiveData?: boolean;
  containsMinorData?: boolean;
};

type ProcessorInput = {
  name: string;
  purpose: string;
  dataCategoryCodes: string[];
  processingLocation?: string;
  contactReference?: string;
  agreementReference?: string;
};

@Injectable()
export class PrivacyRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  listCategories(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT * FROM "PrivacyDataCategory"
      WHERE "societyId"=${societyId}::uuid
      ORDER BY "active" DESC, "name" ASC
    `);
  }

  async createCategory(societyId: string, actorUserId: string, input: DataCategoryInput) {
    const code = this.normaliseCode(input.code);
    const name = input.name.trim();
    const purpose = input.purpose.trim();
    const retentionTrigger = input.retentionTrigger.trim();
    if (!name || !purpose || !retentionTrigger) throw new BadRequestException('Name, purpose and retention trigger are required');

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "PrivacyDataCategory" (
          "societyId", "code", "name", "purpose", "legalBasis", "retentionTrigger", "retentionDays",
          "containsSensitiveData", "containsMinorData", "createdByUserId"
        ) VALUES (
          ${societyId}::uuid, ${code}, ${name}, ${purpose}, ${input.legalBasis?.trim() || null}, ${retentionTrigger},
          ${input.retentionDays ?? null}, ${input.containsSensitiveData ?? false}, ${input.containsMinorData ?? false}, ${actorUserId}::uuid
        )
        RETURNING *
      `);
      const category = rows[0];
      await this.recordEvent(tx, societyId, actorUserId, 'DATA_CATEGORY', category.id, 'CREATED', 'Privacy data category created', { code });
      return category;
    });
  }

  async setCategoryActive(societyId: string, actorUserId: string, categoryId: string, active: boolean) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; code: string }>>(Prisma.sql`
      UPDATE "PrivacyDataCategory"
      SET "active"=${active}, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${categoryId}::uuid AND "societyId"=${societyId}::uuid
      RETURNING "id", "code"
    `);
    const category = rows[0];
    if (!category) throw new NotFoundException('Privacy data category not found');
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "PrivacyRegistryEvent" ("societyId","entityType","entityId","actorUserId","action","summary","metadataJson")
      VALUES (${societyId}::uuid,'DATA_CATEGORY',${categoryId}::uuid,${actorUserId}::uuid,'ACTIVE_CHANGED',${active ? 'Privacy data category activated' : 'Privacy data category deactivated'},${JSON.stringify({ active })}::jsonb)
    `);
    return { ...category, active };
  }

  listProcessors(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT * FROM "PrivacyProcessorRegister"
      WHERE "societyId"=${societyId}::uuid
      ORDER BY "active" DESC, "name" ASC
    `);
  }

  async createProcessor(societyId: string, actorUserId: string, input: ProcessorInput) {
    const name = input.name.trim();
    const purpose = input.purpose.trim();
    if (!name || !purpose) throw new BadRequestException('Processor name and purpose are required');
    const codes = [...new Set(input.dataCategoryCodes.map((value) => this.normaliseCode(value)))];
    if (codes.length === 0) throw new BadRequestException('At least one data category is required');
    await this.assertActiveCategoryCodes(societyId, codes);

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "PrivacyProcessorRegister" (
          "societyId", "name", "purpose", "dataCategoryCodes", "processingLocation", "contactReference", "agreementReference", "createdByUserId"
        ) VALUES (
          ${societyId}::uuid, ${name}, ${purpose}, ${JSON.stringify(codes)}::jsonb, ${input.processingLocation?.trim() || null},
          ${input.contactReference?.trim() || null}, ${input.agreementReference?.trim() || null}, ${actorUserId}::uuid
        )
        RETURNING *
      `);
      const processor = rows[0];
      await this.recordEvent(tx, societyId, actorUserId, 'PROCESSOR', processor.id, 'CREATED', 'Privacy processor registered', { categoryCodes: codes });
      return processor;
    });
  }

  async setProcessorActive(societyId: string, actorUserId: string, processorId: string, active: boolean) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
      UPDATE "PrivacyProcessorRegister"
      SET "active"=${active}, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${processorId}::uuid AND "societyId"=${societyId}::uuid
      RETURNING "id", "name"
    `);
    const processor = rows[0];
    if (!processor) throw new NotFoundException('Privacy processor not found');
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "PrivacyRegistryEvent" ("societyId","entityType","entityId","actorUserId","action","summary","metadataJson")
      VALUES (${societyId}::uuid,'PROCESSOR',${processorId}::uuid,${actorUserId}::uuid,'ACTIVE_CHANGED',${active ? 'Privacy processor activated' : 'Privacy processor deactivated'},${JSON.stringify({ active })}::jsonb)
    `);
    return { ...processor, active };
  }

  history(societyId: string, entityType: 'DATA_CATEGORY' | 'PROCESSOR', entityId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT pre.*, actor."name" AS "actorName"
      FROM "PrivacyRegistryEvent" pre
      JOIN "User" actor ON actor."id"=pre."actorUserId"
      WHERE pre."societyId"=${societyId}::uuid AND pre."entityType"=${entityType} AND pre."entityId"=${entityId}::uuid
      ORDER BY pre."createdAt" ASC
    `);
  }

  private async assertActiveCategoryCodes(societyId: string, codes: string[]) {
    const rows = await this.prisma.$queryRaw<Array<{ code: string }>>(Prisma.sql`
      SELECT "code" FROM "PrivacyDataCategory"
      WHERE "societyId"=${societyId}::uuid AND "active"=true AND "code" IN (${Prisma.join(codes)})
    `);
    const found = new Set(rows.map((row) => row.code));
    const missing = codes.filter((code) => !found.has(code));
    if (missing.length > 0) throw new BadRequestException(`Unknown or inactive privacy data categories: ${missing.join(', ')}`);
  }

  private normaliseCode(value: string) {
    const code = value.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    if (!code) throw new BadRequestException('Privacy data category code is required');
    return code;
  }

  private recordEvent(
    tx: Prisma.TransactionClient,
    societyId: string,
    actorUserId: string,
    entityType: 'DATA_CATEGORY' | 'PROCESSOR',
    entityId: string,
    action: string,
    summary: string,
    metadata: Record<string, unknown>,
  ) {
    return tx.$executeRaw(Prisma.sql`
      INSERT INTO "PrivacyRegistryEvent" ("societyId","entityType","entityId","actorUserId","action","summary","metadataJson")
      VALUES (${societyId}::uuid,${entityType},${entityId}::uuid,${actorUserId}::uuid,${action},${summary},${JSON.stringify(metadata)}::jsonb)
    `);
  }
}
