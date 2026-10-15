import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DocumentsService } from './documents.service';

describe('DocumentsService', () => {
  const societyId = '11111111-1111-4111-8111-111111111111';
  const key = `societies/${societyId}/documents/bylaw.pdf`;

  it('rejects property-owner-only document without unit', async () => {
    const service = new DocumentsService({} as never);
    await expect(service.createDraft(
      societyId,
      '22222222-2222-4222-8222-222222222222',
      { category:'PROPERTY', audience:'PROPERTY_OWNER_ONLY', title:'Sale deed', storageKey:key, fileName:'deed.pdf', mimeType:'application/pdf', sizeBytes:100 },
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects cross-society property document unit', async () => {
    const prisma = { unit: { findFirst: vi.fn().mockResolvedValue(null) } } as never;
    const service = new DocumentsService(prisma);
    await expect(service.createDraft(
      societyId,
      '22222222-2222-4222-8222-222222222222',
      { unitId:'33333333-3333-4333-8333-333333333333', category:'PROPERTY', audience:'PROPERTY_OWNER_ONLY', title:'Sale deed', storageKey:key, fileName:'deed.pdf', mimeType:'application/pdf', sizeBytes:100 },
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates draft and event transactionally', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id:'44444444-4444-4444-8444-444444444444', status:'DRAFT' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: vi.fn(async (cb: (client: unknown) => unknown) => cb(tx)), unit: { findFirst: vi.fn() } } as never;
    const service = new DocumentsService(prisma);
    const result = await service.createDraft(
      societyId,
      '22222222-2222-4222-8222-222222222222',
      { category:'BYLAW', audience:'ALL_MEMBERS', title:'Society bylaws', storageKey:key, fileName:'bylaw.pdf', mimeType:'application/pdf', sizeBytes:100 },
    );
    expect(result).toMatchObject({ status:'DRAFT' });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
