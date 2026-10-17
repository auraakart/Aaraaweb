import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyRegistryService } from './privacy-registry.service';

describe('PrivacyRegistryService', () => {
  it.each([
    ['___Visitor--ID_Proof___', 'VISITOR_ID_PROOF'],
    ['_'.repeat(100000) + 'visit__evidence' + '_'.repeat(100000), 'VISIT__EVIDENCE'],
    ['A' + '_'.repeat(100000) + 'Z', 'A' + '_'.repeat(100000) + 'Z'],
  ])('normalises underscore boundaries without backtracking', async (code, expected) => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ id: 'category-1' }]), $executeRaw: vi.fn() };
    const prisma = { withTenantContext: vi.fn(async (_id: string, run: (client: typeof tx) => unknown) => run(tx)) };
    await new PrivacyRegistryService(prisma as unknown as PrismaService).createCategory('society-1', 'admin-1', {
      code, name: 'Evidence', purpose: 'Review', retentionTrigger: 'Completion',
    });
    expect((tx.$queryRaw.mock.calls[0][0] as { values: unknown[] }).values).toContain(expected);
  });
  it('rejects a long all-separator code before creating a transaction', async () => {
    const prisma = { withTenantContext: vi.fn() };
    await expect(new PrivacyRegistryService(prisma as unknown as PrismaService).createCategory('society-1', 'admin-1', {
      code: '_'.repeat(100000), name: 'Evidence', purpose: 'Review', retentionTrigger: 'Completion',
    })).rejects.toThrow('Privacy data category code is required');
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });
  it('normalises category codes and records append-only creation evidence', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'category-1' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { withTenantContext: vi.fn(async (_societyId: string, callback: (client: unknown) => unknown) => callback(tx)), $queryRaw: vi.fn() };
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

  it('validates processor categories inside the creation transaction', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{ code: 'PAYMENTS' }]),
      $executeRaw: vi.fn(),
    };
    const prisma = { withTenantContext: vi.fn(async (_societyId: string, callback: (client: unknown) => unknown) => callback(tx)), $queryRaw: vi.fn() };
    const service = new PrivacyRegistryService(prisma as unknown as PrismaService);

    await expect(
      service.createProcessor('society-1', 'admin-1', {
        name: 'Example Processor',
        purpose: 'Operational processing',
        dataCategoryCodes: ['PAYMENTS', 'VISITOR_ID_PROOF'],
      }),
    ).rejects.toThrow('Unknown or inactive privacy data categories: VISITOR_ID_PROOF');

    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    const query = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(query.strings.join(' ')).toContain('"PrivacyDataCategory"');
    expect(query.strings.join(' ')).toContain('"active"=true');
    expect(query.strings.join(' ')).toContain('FOR SHARE');
    expect(query.values).toContain('society-1');
  });

  it('changes category active state and evidence in one transaction', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'category-1', code: 'PAYMENTS' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { withTenantContext: vi.fn(async (_societyId: string, callback: (client: unknown) => unknown) => callback(tx)), $queryRaw: vi.fn() };
    const service = new PrivacyRegistryService(prisma as unknown as PrismaService);

    await expect(service.setCategoryActive('society-1', 'admin-1', 'category-1', false)).resolves.toMatchObject({
      id: 'category-1', active: false,
    });
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('changes processor active state and evidence in one transaction', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'processor-1', name: 'Processor' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { withTenantContext: vi.fn(async (_societyId: string, callback: (client: unknown) => unknown) => callback(tx)), $queryRaw: vi.fn() };
    const service = new PrivacyRegistryService(prisma as unknown as PrismaService);

    await expect(service.setProcessorActive('society-1', 'admin-1', 'processor-1', false)).resolves.toMatchObject({
      id: 'processor-1', active: false,
    });
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('scopes category listing to the current society', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const prisma = { $queryRaw: vi.fn(), withTenantContext: vi.fn(async (_societyId: string, callback: (client: typeof tx) => unknown) => callback(tx)) };
    const service = new PrivacyRegistryService(prisma as unknown as PrismaService);

    await service.listCategories('society-1');

    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    const query = tx.$queryRaw.mock.calls[0][0] as { values: unknown[]; strings: readonly string[] };
    expect(query.strings.join(' ')).toContain('"PrivacyDataCategory"');
    expect(query.values).toContain('society-1');
  });

  it('scopes processor history to society, entity type and entity id', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const prisma = { $queryRaw: vi.fn(), withTenantContext: vi.fn(async (_societyId: string, callback: (client: typeof tx) => unknown) => callback(tx)) };
    const service = new PrivacyRegistryService(prisma as unknown as PrismaService);

    await service.history('society-1', 'PROCESSOR', 'processor-1');

    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    const query = tx.$queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(query.values).toContain('society-1');
    expect(query.values).toContain('PROCESSOR');
    expect(query.values).toContain('processor-1');
  });

  it('scopes processor listing to the supplied transaction client', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ id: 'processor-1' }]) };
    const prisma = { $queryRaw: vi.fn(), withTenantContext: vi.fn(async (_societyId: string, callback: (client: typeof tx) => unknown) => callback(tx)) };
    const service = new PrivacyRegistryService(prisma as unknown as PrismaService);
    await expect(service.listProcessors('society-1')).resolves.toEqual([{ id: 'processor-1' }]);
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    const sql = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(sql.strings.join(' ')).toContain('"PrivacyProcessorRegister"');
    expect(sql.values).toContain('society-1');
  });

  it('keeps processor creation and append-only evidence on the same tenant transaction', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{ code: 'PAYMENTS' }]).mockResolvedValueOnce([{ id: 'processor-1' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { $queryRaw: vi.fn(), withTenantContext: vi.fn(async (_societyId: string, callback: (client: typeof tx) => unknown) => callback(tx)) };
    const service = new PrivacyRegistryService(prisma as unknown as PrismaService);
    await expect(service.createProcessor('society-1', 'admin-1', {
      name: 'Processor', purpose: 'Payments', dataCategoryCodes: ['PAYMENTS'],
    })).resolves.toEqual({ id: 'processor-1' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });

  it('fails closed on cross-society category activation without producing evidence', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), $executeRaw: vi.fn() };
    const prisma = { withTenantContext: vi.fn(async (_societyId: string, callback: (client: typeof tx) => unknown) => callback(tx)), $queryRaw: vi.fn() };
    const service = new PrivacyRegistryService(prisma as unknown as PrismaService);
    await expect(service.setCategoryActive('society-1', 'admin-1', 'foreign-category', false))
      .rejects.toThrow('Privacy data category not found');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects processor event failures in the creation transaction', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{ code: 'PAYMENTS' }]).mockResolvedValueOnce([{ id: 'processor-1' }]),
      $executeRaw: vi.fn().mockRejectedValueOnce(new Error('audit unavailable')),
    };
    const prisma = { withTenantContext: vi.fn(async (_societyId: string, callback: (client: typeof tx) => unknown) => callback(tx)), $queryRaw: vi.fn() };
    const service = new PrivacyRegistryService(prisma as unknown as PrismaService);
    await expect(service.createProcessor('society-1', 'admin-1', {
      name: 'Processor', purpose: 'Payments', dataCategoryCodes: ['PAYMENTS'],
    })).rejects.toThrow('audit unavailable');
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
