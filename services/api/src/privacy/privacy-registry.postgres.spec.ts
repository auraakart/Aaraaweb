import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyRegistryService } from './privacy-registry.service';

const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;

withDatabase('V5.2.17 privacy registry society transactions on PostgreSQL', () => {
  it('keeps categories, processors and immutable history within each society', async () => {
    const prisma = new PrismaService();
    const registry = new PrivacyRegistryService(prisma);
    const societyA = randomUUID(), societyB = randomUUID(), actor = randomUUID();
    try {
      await prisma.society.createMany({ data: [
        { id: societyA, name: 'Registry A', code: 'registry-' + societyA },
        { id: societyB, name: 'Registry B', code: 'registry-' + societyB },
      ] });
      await prisma.user.create({ data: { id: actor, phone: 'registry-' + actor } });
      const categoryInput = (code: string) => ({
        code, name: 'Restricted document', purpose: 'Internal privacy register',
        retentionTrigger: 'Document expiry', retentionDays: 30,
      });
      const categoryA = await registry.createCategory(societyA, actor, categoryInput('DATA_A')) as { id: string };
      const categoryB = await registry.createCategory(societyB, actor, categoryInput('DATA_B')) as { id: string };
      expect((await registry.listCategories(societyA) as Array<{ id: string }>).map(row => row.id)).toEqual([categoryA.id]);
      expect((await registry.listCategories(societyB) as Array<{ id: string }>).map(row => row.id)).toEqual([categoryB.id]);

      await expect(registry.setCategoryActive(societyA, actor, categoryB.id, false))
        .rejects.toBeInstanceOf(NotFoundException);
      expect(await registry.history(societyA, 'DATA_CATEGORY', categoryB.id)).toEqual([]);

      const input = (dataCategoryCodes: string[]) => ({
        name: 'Processor', purpose: 'Restricted processing', dataCategoryCodes,
      });
      await expect(registry.createProcessor(societyA, actor, input(['DATA_B'])))
        .rejects.toBeInstanceOf(BadRequestException);
      const processorA = await registry.createProcessor(societyA, actor, input(['DATA_A'])) as { id: string };
      const processorB = await registry.createProcessor(societyB, actor, input(['DATA_B'])) as { id: string };
      expect((await registry.listProcessors(societyA) as Array<{ id: string }>).map(row => row.id)).toEqual([processorA.id]);
      expect((await registry.listProcessors(societyB) as Array<{ id: string }>).map(row => row.id)).toEqual([processorB.id]);
      await expect(registry.setProcessorActive(societyA, actor, processorB.id, false))
        .rejects.toBeInstanceOf(NotFoundException);
      expect(await registry.history(societyA, 'PROCESSOR', processorB.id)).toEqual([]);

      await registry.setCategoryActive(societyA, actor, categoryA.id, false);
      await expect(registry.createProcessor(societyA, actor, input(['DATA_A'])))
        .rejects.toBeInstanceOf(BadRequestException);
      await registry.setProcessorActive(societyA, actor, processorA.id, false);

      const eventsA = await registry.history(societyA, 'DATA_CATEGORY', categoryA.id) as Array<{ action: string }>;
      expect(eventsA.map(event => event.action)).toEqual(['CREATED', 'ACTIVE_CHANGED']);
      const processorEvents = await registry.history(societyA, 'PROCESSOR', processorA.id) as Array<{ action: string }>;
      expect(processorEvents.map(event => event.action)).toEqual(['CREATED', 'ACTIVE_CHANGED']);
      expect((await registry.listCategories(societyB) as Array<{ active: boolean }>)[0].active).toBe(true);
      expect((await registry.listProcessors(societyB) as Array<{ active: boolean }>)[0].active).toBe(true);
      await expect(prisma.$executeRaw(Prisma.sql`
        DELETE FROM "PrivacyRegistryEvent" WHERE "societyId"=${societyA}::uuid
      `)).rejects.toThrow();
      await expect(registry.createCategory(societyA, actor, categoryInput('DATA_A'))).rejects.toThrow();
      expect((await registry.history(societyA, 'DATA_CATEGORY', categoryA.id) as Array<unknown>)).toHaveLength(2);
    } finally {
      try {
        await prisma.$transaction(async tx => {
          // Fixture-only cleanup; transactional DDL restores append-only enforcement.
          await tx.$executeRaw(Prisma.sql`ALTER TABLE "PrivacyRegistryEvent" DISABLE TRIGGER "PrivacyRegistryEvent_append_only_delete"`);
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM "PrivacyRegistryEvent" WHERE "societyId" IN (${societyA}::uuid, ${societyB}::uuid)
          `);
          await tx.$executeRaw(Prisma.sql`ALTER TABLE "PrivacyRegistryEvent" ENABLE TRIGGER "PrivacyRegistryEvent_append_only_delete"`);
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM "PrivacyProcessorRegister" WHERE "societyId" IN (${societyA}::uuid, ${societyB}::uuid)
          `);
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM "PrivacyDataCategory" WHERE "societyId" IN (${societyA}::uuid, ${societyB}::uuid)
          `);
        });
        await prisma.society.deleteMany({ where: { id: { in: [societyA, societyB] } } });
        await prisma.user.deleteMany({ where: { id: actor } });
      } finally {
        await prisma.$disconnect();
      }
    }
  });
});
