import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyRegistryService } from './privacy-registry.service';

describe('PrivacyRegistryService', () => {
  it('normalises category codes and records append-only creation evidence', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'category-1' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    const service = new PrivacyRegistryService(prisma as unknown as PrismaService);

    await service.createCategory('society-1', 'admin-1', {
      code: 'Visitor ID Proof',
      name: 'Visitor identity evidence',
      purpose: 'Gate security and access audit',
      retentionTrigger: 'Visitor checkout',
      retentionDays: 90,
    });

    const insert = tx.$queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(insert.values).toContain('VISITOR_ID_PROOF');
    const event = tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[] };
    expect(event.strings.join(' ')).toContain('"PrivacyRegistryEvent"');
  });

  it('rejects processors that reference categories outside the active current-society inventory', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ code: 'PAYMENTS' }]) };
    const service = new PrivacyRegistryService(prisma as unknown as PrismaService);

    await expect(
      service.createProcessor('society-1', 'admin-1', {
        name: 'Example Processor',
        purpose: 'Operational processing',
        dataCategoryCodes: ['PAYMENTS', 'VISITOR_ID_PROOF'],
      }),
    ).rejects.toThrow('Unknown or inactive privacy data categories: VISITOR_ID_PROOF');

    const query = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(query.strings.join(' ')).toContain('"societyId"');
    expect(query.strings.join(' ')).toContain('"active"=true');
    expect(query.values).toContain('society-1');
  });

  it('scopes category listing to the current society', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new PrivacyRegistryService(prisma as unknown as PrismaService);

    await service.listCategories('society-1');

    const query = prisma.$queryRaw.mock.calls[0][0] as { values: unknown[]; strings: readonly string[] };
    expect(query.strings.join(' ')).toContain('"PrivacyDataCategory"');
    expect(query.values).toContain('society-1');
  });

  it('scopes processor history to society, entity type and entity id', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new PrivacyRegistryService(prisma as unknown as PrismaService);

    await service.history('society-1', 'PROCESSOR', 'processor-1');

    const query = prisma.$queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(query.values).toContain('society-1');
    expect(query.values).toContain('PROCESSOR');
    expect(query.values).toContain('processor-1');
  });
});
